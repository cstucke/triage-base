import { z } from "zod";
import { TriageSchema, type TriageResult } from "./schema";

export type ParseResult =
  | { ok: true; data: TriageResult }
  | { ok: false; reason: "invalid_json" | "schema_mismatch"; issues?: z.core.$ZodIssue[] };

// Matches a whole reply wrapped in ``` or ```json fences.
const CODE_FENCE = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i;

/** Parse and validate a raw model reply. Used by both structured-output modes. */
export function parseTriage(raw: string): ParseResult {
  const trimmed = raw.trim();
  const text = CODE_FENCE.exec(trimmed)?.[1] ?? trimmed;

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  const result = TriageSchema.safeParse(json);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, reason: "schema_mismatch", issues: result.error.issues };
}
