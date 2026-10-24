import { z } from "zod";
import { TriageSchema, WriteupSchema, type DmTriageResult, type TriageResult } from "./schema";

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "invalid_json" | "schema_mismatch"; issues?: z.core.$ZodIssue[] };

// Matches a whole reply wrapped in ``` or ```json fences.
const CODE_FENCE = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i;

function parseWith<T>(raw: string, schema: z.ZodType<T>): ParseResult<T> {
  const trimmed = raw.trim();
  const text = CODE_FENCE.exec(trimmed)?.[1] ?? trimmed;

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  const result = schema.safeParse(json);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, reason: "schema_mismatch", issues: result.error.issues };
}

/** Parse and validate a raw model reply. Used by both structured-output modes. */
export function parseTriage(raw: string): ParseResult<TriageResult> {
  return parseWith(raw, TriageSchema);
}

/** dm+llm: the LLM's write-up must pass WriteupSchema, then the merged result must pass TriageSchema. */
export function parseDmLlm(raw: string, decision: DmTriageResult): ParseResult<TriageResult> {
  const writeup = parseWith(raw, WriteupSchema);
  if (!writeup.ok) return writeup;
  const result = TriageSchema.safeParse({ ...decision, ...writeup.data });
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, reason: "schema_mismatch", issues: result.error.issues };
}