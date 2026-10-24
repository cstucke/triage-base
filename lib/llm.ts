import OpenAI from "openai";

const apiKey = process.env.LLM_API_KEY;
const baseURL = process.env.LLM_BASE_URL;
export const LLM_MODEL = process.env.LLM_MODEL ?? "";

if (!apiKey || !LLM_MODEL) {
  throw new Error("Missing LLM_API_KEY or LLM_MODEL in .env.local");
}

// How we ask the model for structured output:
// - "json_schema": send the JSON Schema via response_format (provider enforces it).
// - "prompt": describe the JSON shape in the system prompt only.
// Either way, the reply is validated with Zod before it reaches the user.
const STRUCTURED_OUTPUT_MODES = ["json_schema", "prompt"] as const;
export type StructuredOutputMode = (typeof STRUCTURED_OUTPUT_MODES)[number];

const rawMode = process.env.LLM_STRUCTURED_OUTPUT ?? "json_schema";
if (!STRUCTURED_OUTPUT_MODES.includes(rawMode as StructuredOutputMode)) {
  throw new Error(
    `Invalid LLM_STRUCTURED_OUTPUT="${rawMode}". Use one of: ${STRUCTURED_OUTPUT_MODES.join(", ")}.`,
  );
}
export const LLM_STRUCTURED_OUTPUT = rawMode as StructuredOutputMode;

export const llm = new OpenAI({ apiKey, baseURL, timeout: 30_000, maxRetries: 1 });

const priceInput = process.env.LLM_PRICE_INPUT_PER_1M;
const priceOutput = process.env.LLM_PRICE_OUTPUT_PER_1M;
const PRICE_INPUT_PER_1M = priceInput ? Number(priceInput) : null;
const PRICE_OUTPUT_PER_1M = priceOutput ? Number(priceOutput) : null;

export type Usage = { input: number; output: number; total: number };

/** Estimated cost in USD, or null when the provider reported no usage or no price is set. */
export function costOf(usage: Usage | null): number | null {
  if (!usage || PRICE_INPUT_PER_1M === null || PRICE_OUTPUT_PER_1M === null) return null;
  return (usage.input * PRICE_INPUT_PER_1M + usage.output * PRICE_OUTPUT_PER_1M) / 1_000_000;
}