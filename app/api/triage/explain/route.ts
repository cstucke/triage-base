import { llm, LLM_MODEL } from "../../../../lib/llm";
import { buildExplainMessage, EXPLAIN_SYSTEM_PROMPT } from "../../../../lib/prompt";
import { ExplainRequestSchema } from "../../../../lib/schema";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = ExplainRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Please provide a ticket (string subject, non-empty body of at most 5,000 characters) and a valid triage result." },
      { status: 400 },
    );
  }

  try {
    const stream = await llm.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: "system", content: EXPLAIN_SYSTEM_PROMPT },
        { role: "user", content: buildExplainMessage(parsed.data.ticket, parsed.data.triage) },
      ],
      stream: true,
    });

    // Forward only the text of each chunk, as it arrives.
    const encoder = new TextEncoder();
    const text = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          controller.enqueue(encoder.encode(chunk.choices[0]?.delta?.content ?? ""));
        }
        controller.close();
      },
    });

    return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (err) {
    console.error("LLM call failed:", err);
    return Response.json({ error: "The language model request failed." }, { status: 502 });
  }
}