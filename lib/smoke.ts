import path from "node:path";
import type { Usage } from "./llm";
import type { TriageResult } from "./schema";

export const RUNS_DIR = path.join(process.cwd(), "runs");

export const DATASET_FILES = {
  labelled_100: path.join(process.cwd(), "data", "support_tickets_100_labelled.json"),
  all_500: path.join(process.cwd(), "data", "support_tickets_500.json"),
};
export type Dataset = keyof typeof DATASET_FILES;

export type SmokeResult = {
  ticket_id: string;
  outcome: number; // HTTP status returned by /api/triage
  output: TriageResult | null; // null when the triage failed
  expected: { category: string; priority: string } | null; // null for the 500 set
  usage: Usage | null;
  cost_usd: number | null;
  latency_ms: number;
};

export type SmokeRun = {
  date: string;
  dataset: Dataset;
  prompt_version: string;
  model: string;
  outcome_counts: Record<string, number>;
  // Accuracy and mismatches are over tickets that returned a prediction (outcome 200).
  category_accuracy: number | null; // null when there is nothing to compare (e.g. the 500 set)
  priority_accuracy: number | null;
  category_mismatches: number;
  priority_mismatches: number;
  category_confusion: Record<string, Record<string, number>>; // expected → predicted → count
  avg_latency_ms: number;
  total_cost_usd: number | null; // null when no ticket has a cost
  results: SmokeResult[];
};