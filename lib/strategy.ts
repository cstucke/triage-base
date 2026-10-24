import { costOf, LLM_MODEL, type Usage } from "./llm";
import { DM_MODEL, dmCostOf } from "./dm";
import { DM_CRITERIA_VERSION, PROMPT_VERSION, PROMPT_VERSION_DM_LLM } from "./prompt";
import type { Strategy } from "./schema";

// What each strategy calls. Logged with every call and saved with every run.
export const STRATEGY_INFO: Record<Strategy, { api: string; promptVersion: string; model: string }> = {
  llm: { api: "chat.completions", promptVersion: PROMPT_VERSION, model: LLM_MODEL },
  dm: { api: "systemone", promptVersion: DM_CRITERIA_VERSION, model: DM_MODEL },
  "dm+llm": { api: "systemone+chat.completions", promptVersion: PROMPT_VERSION_DM_LLM, model: `${DM_MODEL}+${LLM_MODEL}` },
};

/** Cost of one triage request: the LLM part, the DM part, or both. null when a part has no cost. */
export function strategyCost(strategy: Strategy, usage: Usage | null, dmUsage: Usage | null): number | null {
  if (strategy === "llm") return costOf(usage);
  if (strategy === "dm") return dmCostOf(dmUsage);
  const llmCost = costOf(usage);
  const dmCost = dmCostOf(dmUsage);
  return llmCost === null || dmCost === null ? null : llmCost + dmCost;
}