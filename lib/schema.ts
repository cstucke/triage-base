import { z } from "zod";

export const CATEGORIES = ["billing", "technical_bug", "account", "feature_request"] as const;
export const PRIORITIES = ["low", "medium", "high"] as const;
export const STRATEGIES = ["llm", "dm", "dm+llm"] as const;
export type Strategy = (typeof STRATEGIES)[number];

export const TriageRequestSchema = z.object({
  ticket: z.object({
    subject: z.string(),
    body: z.string().trim().min(1).max(5000),
  }),
  strategy: z.enum(STRATEGIES).default("llm"),
});

export const TriageSchema = z.strictObject({
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  summary: z.string().min(1).max(300),
  suggested_action: z.string().min(1).max(500),
});

export type TriageResult = z.infer<typeof TriageSchema>;
export const ExplainRequestSchema = TriageRequestSchema.extend({ triage: TriageSchema });

const { $schema: _meta, ...triageJsonSchema } = z.toJSONSchema(TriageSchema);
export const TRIAGE_JSON_SCHEMA = triageJsonSchema;

// dm: the decision model only chooses category and priority.
export const DmTriageSchema = TriageSchema.pick({ category: true, priority: true });
export type DmTriageResult = z.infer<typeof DmTriageSchema>;

// dm+llm: the LLM only writes the text fields for the DM's choice.
export const WriteupSchema = TriageSchema.pick({ summary: true, suggested_action: true });

const { $schema: _writeupMeta, ...writeupJsonSchema } = z.toJSONSchema(WriteupSchema);
export const WRITEUP_JSON_SCHEMA = writeupJsonSchema;