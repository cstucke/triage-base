import { z } from "zod";
import type { Usage } from "./llm";
import { DM_QUESTIONS, type Ticket } from "./prompt";
import { DmTriageSchema, type DmTriageResult } from "./schema";

const apiKey = process.env.DM_API_KEY;
const baseURL = process.env.DM_BASE_URL;
export const DM_MODEL = process.env.DM_MODEL ?? "";

if (!apiKey || !baseURL || !DM_MODEL) {
  throw new Error("Missing DM_BASE_URL, DM_API_KEY or DM_MODEL in .env.local");
}

// Set explicitly. The timeout is per attempt, below the provider's own 30 s.
const DM_TIMEOUT_MS = 25_000;
const DM_MAX_RETRIES = 1;

const priceInput = process.env.DM_PRICE_INPUT_PER_1M;
const priceOutput = process.env.DM_PRICE_OUTPUT_PER_1M;
const PRICE_INPUT_PER_1M = priceInput ? Number(priceInput) : null;
const PRICE_OUTPUT_PER_1M = priceOutput ? Number(priceOutput) : null;

/** Estimated cost in USD, or null when the provider reported no usage or no price is set. */
export function dmCostOf(usage: Usage | null): number | null {
  if (!usage || PRICE_INPUT_PER_1M === null || PRICE_OUTPUT_PER_1M === null) return null;
  return (usage.input * PRICE_INPUT_PER_1M + usage.output * PRICE_OUTPUT_PER_1M) / 1_000_000;
}

// Response contract, from https://decision.vllm-sr.ai/docs. A failed question comes back inside
// a 200 as { type, error: "invalid_question", message }: it has no `choice`, so it fails here.
function choiceAnswer<T extends z.ZodType>(choice: T) {
  return z.object({
    type: z.literal("choice"),
    choice,
    probabilities: z.record(z.string(), z.number()),
    confidence: z.number(),
  });
}

const DmResponseSchema = z.object({
  answers: z.object({
    category: choiceAnswer(DmTriageSchema.shape.category),
    priority: choiceAnswer(DmTriageSchema.shape.priority),
  }),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).optional(),
});

export type DmAnswers = z.infer<typeof DmResponseSchema>["answers"];
export type DmDecision = { decision: DmTriageResult; answers: DmAnswers; usage: Usage | null };
// Our codes from the Activity 4 error table.
export type DmFailure = "invalid_model_output" | "rate_limited" | "triage_unavailable" | "triage_timeout" | "internal_error";
export type DmCall = ({ ok: true } & DmDecision) | { ok: false; code: DmFailure };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Ask the DM for category and priority. Plain fetch: the chat SDK does not apply to this endpoint. */
export async function askDm(ticket: Ticket): Promise<DmCall> {
  for (let attempt = 0; ; attempt++) {
    const canRetry = attempt < DM_MAX_RETRIES;
    let response: Response;
    try {
      response = await fetch(`${baseURL}/v1/systemone`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: DM_MODEL, state: `${ticket.subject}\n\n${ticket.body}`, questions: DM_QUESTIONS }),
        signal: AbortSignal.timeout(DM_TIMEOUT_MS),
      });
    } catch (err) {
      console.error("DM call failed:", err);
      if (err instanceof Error && err.name === "TimeoutError") return { ok: false, code: "triage_timeout" };
      if (canRetry) continue;
      return { ok: false, code: "triage_unavailable" };
    }

    // 429, 502 and 503 carry Retry-After: wait that long, then retry once.
    if ([429, 502, 503].includes(response.status) && canRetry) {
      await sleep(Number(response.headers.get("Retry-After") ?? 1) * 1000);
      continue;
    }
    if (!response.ok) {
      console.error("DM error:", response.status, await response.text());
      if (response.status === 429) return { ok: false, code: "rate_limited" };
      if (response.status === 502 || response.status === 503) return { ok: false, code: "triage_unavailable" };
      if (response.status === 504) return { ok: false, code: "triage_timeout" };
      return { ok: false, code: "internal_error" }; // wrong key, model or request (400/401/403)
    }

    const parsed = DmResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      console.warn("Invalid DM output", { issues: parsed.error.issues });
      return { ok: false, code: "invalid_model_output" };
    }
    const { answers, usage } = parsed.data;
    return {
      ok: true,
      decision: { category: answers.category.choice, priority: answers.priority.choice },
      answers,
      usage: usage
        ? { input: usage.input_tokens, output: usage.output_tokens, total: usage.input_tokens + usage.output_tokens }
        : null,
    };
  }
}