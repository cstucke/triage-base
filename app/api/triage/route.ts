import { llm, LLM_MODEL, LLM_STRUCTURED_OUTPUT } from "../../../lib/llm";
import {
  buildSystemPrompt,
  buildUserMessage,
  PROMPT_VERSION,
  type Ticket,
} from "../../../lib/prompt";
import { parseTriage, TRIAGE_JSON_SCHEMA } from "../../../lib/triage";

const MAX_ATTEMPTS = 2; // one retry if the model's output fails validation

function isTicket(t: unknown): t is Ticket {
  return (
    typeof t === "object" &&
    t !== null &&
    "subject" in t &&
    typeof t.subject === "string" &&
    "body" in t &&
    typeof t.body === "string" &&
    t.body.trim() !== ""
  );
}

async function callModel(ticket: Ticket): Promise<string> {
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
  return completion.choices[0]?.message?.content ?? "";
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || !("ticket" in body) || !isTicket(body.ticket)) {
    return Response.json(
      { error: "Please provide a ticket with a string subject and a non-empty body." },
      { status: 400 },
    );
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let raw: string;
    try {
      raw = await callModel(body.ticket);
    } catch (err) {
      console.error("LLM call failed:", err);
      return Response.json({ error: "The language model request failed." }, { status: 502 });
    }

    const result = parseTriage(raw);
    if (result.ok) {
      return Response.json({ triage: result.data, promptVersion: PROMPT_VERSION });
    }

    // Log why it failed, never the raw model text, and never send it to the client.
    console.warn("Invalid triage output", {
      attempt,
      mode: LLM_STRUCTURED_OUTPUT,
      promptVersion: PROMPT_VERSION,
      reason: result.reason,
      rawLength: raw.length,
      issues: result.issues,
    });
  }

  return Response.json(
    { error: "The model returned an invalid triage result. Please try again." },
    { status: 502 },
  );
}
