import { llm, LLM_MODEL } from "../../../../lib/llm";
import {
  buildUserMessage,
  PROMPT_VERSION_V1,
  SYSTEM_PROMPT_V1,
  type Ticket,
} from "../../../../lib/prompt";

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

  try {
    const completion = await llm.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT_V1 },
        { role: "user", content: buildUserMessage(body.ticket) },
      ],
    });

    return Response.json({
      answer: completion.choices[0]?.message?.content ?? "",
      promptVersion: PROMPT_VERSION_V1,
    });
  } catch (err) {
    console.error("LLM call failed:", err);
    return Response.json({ error: "The language model request failed." }, { status: 502 });
  }
}