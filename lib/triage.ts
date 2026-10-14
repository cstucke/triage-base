import { z } from "zod";

// Single source of truth for the triage result. The JSON Schema sent to the
// provider and the prompt description are both derived from this.
export const CATEGORIES = ["billing", "technical_bug", "account", "feature_request"] as const;
export const PRIORITIES = ["low", "medium", "high"] as const;

export const TriageSchema = z.strictObject({
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  summary: z.string().min(1),
  suggested_action: z.string().min(1),
});

export type TriageResult = z.infer<typeof TriageSchema>;

// strictObject -> additionalProperties: false, and every key is required.
// Drop the "$schema" meta key: providers expect the bare schema object.
const { $schema: _meta, ...triageJsonSchema } = z.toJSONSchema(TriageSchema);
export const TRIAGE_JSON_SCHEMA = triageJsonSchema;

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
