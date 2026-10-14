import { llm, LLM_MODEL } from "../../../lib/llm";

type ChatMessage = { role: "user" | "assistant"; content: string };

function isChatMessage(m: unknown): m is ChatMessage {
  return (
    typeof m === "object" &&
    m !== null &&
    "role" in m &&
    (m.role === "user" || m.role === "assistant") &&
    "content" in m &&
    typeof m.content === "string" &&
    m.content.trim() !== ""
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("messages" in body) ||
    !Array.isArray(body.messages) ||
    body.messages.length === 0 ||
    !body.messages.every(isChatMessage)
  ) {
    return Response.json(
      {
        error:
          "Please provide a non-empty messages array. Each message needs role 'user' or 'assistant' and non-empty content.",
      },
      { status: 400 },
    );
  }

  const messages = body.messages as ChatMessage[];

  if (messages[messages.length - 1].role !== "user") {
    return Response.json(
      { error: "The last message must come from the user." },
      { status: 400 },
    );
  }

  try {
    const completion = await llm.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: "system", content: "You are a helpful assistant. Answer concisely." },
        ...messages,
      ],
    });

    return Response.json({
      answer: completion.choices[0]?.message?.content ?? "",
    });
  } catch (err) {
    console.error("LLM call failed:", err);
    return Response.json(
      { error: "The language model request failed." },
      { status: 502 },
    );
  }
}