import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Usage } from "./llm";

export const LOG_FILE = path.join(process.cwd(), "logs", "llm-calls.jsonl");

// One line per triage request. Never contains the key or the ticket text.
export type LlmCallLog = {
  ts: string;
  route: string;
  api: string;
  prompt_version: string;
  model: string;
  status: number;
  usage: Usage | null; // null = the provider reported no usage
  cost_usd: number | null; // null = no usage or no price set
};

export async function logLlmCall(entry: LlmCallLog): Promise<void> {
  await mkdir(path.dirname(LOG_FILE), { recursive: true });
  await appendFile(LOG_FILE, JSON.stringify(entry) + "\n");
}