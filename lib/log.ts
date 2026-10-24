import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { Usage } from "./llm";
import type { Strategy } from "./schema";

export const LOG_FILE = path.join(process.cwd(), "logs", "llm-calls.jsonl");

// One line per triage request. Never contains the key or the ticket text.
export type LlmCallLog = {
  ts: string;
  route: string;
  api: string;
  strategy?: Strategy; // absent in lines logged before strategies existed (those were all llm)
  prompt_version: string;
  model: string; // dm+llm: both models, "<dm model>+<llm model>"
  status: number;
  usage: Usage | null; // null = the provider reported no usage; dm+llm: both calls added up
  cost_usd: number | null; // null = no usage or no price set
};

export async function logLlmCall(entry: LlmCallLog): Promise<void> {
  await mkdir(path.dirname(LOG_FILE), { recursive: true });
  await appendFile(LOG_FILE, JSON.stringify(entry) + "\n");
}