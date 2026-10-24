import { askDm, type DmDecision, type DmFailure } from "../../../lib/dm";
import { llm, LLM_MODEL, LLM_STRUCTURED_OUTPUT, type Usage } from "../../../lib/llm";
import { logLlmCall } from "../../../lib/log";
import {
  buildDmLlmSystemPrompt,
  buildDmLlmUserMessage,
  buildSystemPrompt,
  buildUserMessage,
} from "../../../lib/prompt";
import { STRATEGY_INFO, strategyCost } from "../../../lib/strategy";
import { parseDmLlm, parseTriage } from "../../../lib/triage";
import { TRIAGE_JSON_SCHEMA, TriageRequestSchema, WRITEUP_JSON_SCHEMA } from "../../../lib/schema";
import OpenAI from "openai";

const MAX_ATTEMPTS = 2; // one retry if the model's output fails validation
const NO_USAGE: Usage = { input: 0, output: 0, total: 0 };

// DM failures map onto the same error table as the LLM ones.
const DM_ERRORS: Record<DmFailure, { status: number; error: string }> = {
  invalid_model_output: { status: 502, error: "The decision model returned an invalid triage result. Please try again." },
  rate_limited: { status: 429, error: "Too many requests. Please try again later." },
  triage_unavailable: { status: 502, error: "The decision model request failed." },
  triage_timeout: { status: 504, error: "The decision model took too long to answer." },
  internal_error: { status: 500, error: "Something went wrong on our side." },
};

type ModelCall = { raw: string; usage: Usage | null };

async function callModel(
  system: string,
  user: string,
  schemaName: string,
  schema: Record<string, unknown>,
): Promise<ModelCall> {
  const completion = await llm.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    ...(LLM_STRUCTURED_OUTPUT === "json_schema" && {
      response_format: {
        type: "json_schema",
        json_schema: { name: schemaName, strict: true, schema },
      },
    }),
  });
  const usage = completion.usage
    ? {
        input: completion.usage.prompt_tokens,
        output: completion.usage.completion_tokens,
        total: completion.usage.total_tokens,
      }
    : null;
  const choice = completion.choices[0];
  if (choice?.finish_reason === "length") return { raw: "", usage }; // truncated: treated as invalid output
  return { raw: choice?.message?.content ?? "", usage };
}

// Tokens of a retried request count both attempts.
function addUsage(a: Usage | null, b: Usage | null): Usage | null {
  return a && b ? { input: a.input + b.input, output: a.output + b.output, total: a.total + b.total } : null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = TriageRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
       { error: "Please provide a ticket with a string subject and a non-empty body of at most 5,000 characters." },
      { status: 400 },
    );
  }

  const { ticket, strategy } = parsed.data;
  const info = STRATEGY_INFO[strategy];
  let usage: Usage | null = NO_USAGE; // LLM tokens
  let dmUsage: Usage | null = null; // DM tokens

  // Log one line for this request, then reply.
  async function reply(status: number, responseBody: object): Promise<Response> {
    await logLlmCall({
      ts: new Date().toISOString(),
      route: "/api/triage",
      api: info.api,
      strategy,
      prompt_version: info.promptVersion,
      model: info.model,
      status,
      usage: strategy === "llm" ? usage : strategy === "dm" ? dmUsage : addUsage(usage, dmUsage),
      cost_usd: strategyCost(strategy, usage, dmUsage),
    });
    return Response.json(responseBody, { status });
  }

  // dm and dm+llm: the DM chooses category and priority first.
  let dm: DmDecision | null = null;
  if (strategy !== "llm") {
    const dmCall = await askDm(ticket);
    if (!dmCall.ok) {
      const { status, error } = DM_ERRORS[dmCall.code];
      return reply(status, { error, code: dmCall.code });
    }
    dm = dmCall;
    dmUsage = dmCall.usage;
    if (strategy === "dm") {
      return reply(200, { triage: dmCall.decision, promptVersion: info.promptVersion, dmUsage, dmAnswers: dmCall.answers });
    }
  }

  // llm: the LLM triages the ticket. dm+llm: it writes summary and suggested_action for the DM's choice.
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let call: ModelCall;
    try {
      call = dm
        ? await callModel(
            buildDmLlmSystemPrompt(LLM_STRUCTURED_OUTPUT),
            buildDmLlmUserMessage(ticket, dm.decision),
            "triage_writeup",
            WRITEUP_JSON_SCHEMA,
          )
        : await callModel(
            buildSystemPrompt(LLM_STRUCTURED_OUTPUT),
            buildUserMessage(ticket),
            "triage_result",
            TRIAGE_JSON_SCHEMA,
          );
    } catch (err) {
      console.error("LLM call failed:", err);
      usage = null; // a failed call reports no usage
      if (err instanceof OpenAI.APIConnectionTimeoutError) {
        return reply(504, { error: "The language model took too long to answer.", code: "triage_timeout" });
      }
      if (err instanceof OpenAI.RateLimitError) {
        return reply(429, { error: "Too many requests. Please try again later.", code: "rate_limited" });
      }
      if (err instanceof OpenAI.APIConnectionError || err instanceof OpenAI.InternalServerError) {
        return reply(502, { error: "The language model request failed.", code: "triage_unavailable" });
      }
      // Wrong key, model or parameter (400/401/403/404).
      return reply(500, { error: "Something went wrong on our side.", code: "internal_error" });
    }

    usage = addUsage(usage, call.usage);
    const result = dm ? parseDmLlm(call.raw, dm.decision) : parseTriage(call.raw);
    if (result.ok) {
      return reply(200, {
        triage: result.data,
        promptVersion: info.promptVersion,
        usage,
        ...(dm && { dmUsage, dmAnswers: dm.answers }),
      });
    }

    // Log why it failed, never the raw model text, and never send it to the client.
    console.warn("Invalid triage output", {
      attempt,
      mode: LLM_STRUCTURED_OUTPUT,
      promptVersion: info.promptVersion,
      reason: result.reason,
      rawLength: call.raw.length,
      issues: result.issues,
    });
  }

  return reply(502, {
    error: "The model returned an invalid triage result. Please try again.",
    code: "invalid_model_output",
  });
}