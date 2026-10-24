import { z } from "zod";

export const CATEGORIES = ["billing", "technical_bug", "account", "feature_request"] as const;
export const PRIORITIES = ["low", "medium", "high"] as const;

export const TriageRequestSchema = z.object({
  ticket: z.object({
    subject: z.string(),
    body: z.string().trim().min(1),
  }),
});

export const TriageSchema = z.strictObject({
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  summary: z.string().min(1).max(300),
  suggested_action: z.string().min(1).max(500),
});

export type TriageResult = z.infer<typeof TriageSchema>;

const { $schema: _meta, ...triageJsonSchema } = z.toJSONSchema(TriageSchema);
export const TRIAGE_JSON_SCHEMA = triageJsonSchema;