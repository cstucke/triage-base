import { costOf, llm, LLM_MODEL, LLM_STRUCTURED_OUTPUT, type Usage } from "../../../lib/llm";
import { logLlmCall } from "../../../lib/log";
import {
  buildSystemPrompt,
  buildUserMessage,
  PROMPT_VERSION,
  type Ticket,
} from "../../../lib/prompt";
import { parseTriage } from "../../../lib/triage";
import { TRIAGE_JSON_SCHEMA, TriageRequestSchema } from "../../../lib/schema";
import OpenAI from "openai";

const MAX_ATTEMPTS = 2; // one retry if the model's output fails validation
const NO_USAGE: Usage = { input: 0, output: 0, total: 0 };

type ModelCall = { raw: string; usage: Usage | null };

async function callModel(ticket: Ticket): Promise<ModelCall> {
  const completion = await llm.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: buildSystemPrompt(LLM_STRUCTURED_OUTPUT) },
      { role: "user", content: buildUserMessage(ticket) },
    ],
    ...(LLM_STRUCTURED_OUTPUT === "json_schema" && {
      response_format: {
        type: "json_schema",
        json_schema: { name: "triage_result", strict: true, schema: TRIAGE_JSON_SCHEMA },
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
      { error: "Please provide a ticket with a string subject and a non-empty body." },
      { status: 400 },
    );
  }

  let usage: Usage | null = NO_USAGE;

  // Log one line for this request, then reply.
  async function reply(status: number, responseBody: object): Promise<Response> {
    await logLlmCall({
      ts: new Date().toISOString(),
      route: "/api/triage",
      api: "chat.completions",
      prompt_version: PROMPT_VERSION,
      model: LLM_MODEL,
      status,
      usage,
      cost_usd: costOf(usage),
    });
    return Response.json(responseBody, { status });
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let call: ModelCall;
    try {
      call = await callModel(parsed.data.ticket);
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
    const result = parseTriage(call.raw);
    if (result.ok) {
      return reply(200, { triage: result.data, promptVersion: PROMPT_VERSION, usage });
    }

    // Log why it failed, never the raw model text, and never send it to the client.
    console.warn("Invalid triage output", {
      attempt,
      mode: LLM_STRUCTURED_OUTPUT,
      promptVersion: PROMPT_VERSION,
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