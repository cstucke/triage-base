import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { costOf, LLM_MODEL, type Usage } from "../../../lib/llm";
import { PROMPT_VERSION } from "../../../lib/prompt";
import type { TriageResult } from "../../../lib/schema";
import { DATASET_FILES, RUNS_DIR, type Dataset, type SmokeResult, type SmokeRun } from "../../../lib/smoke";

type DatasetTicket = { ticket_id: string; subject: string; body: string; category?: string; priority?: string };

export async function POST(request: Request) {
  const { dataset, count } = (await request.json()) as { dataset: Dataset; count: number };
  const tickets = JSON.parse(await readFile(DATASET_FILES[dataset], "utf8")) as DatasetTicket[];

  // Pick `count` tickets at random: shuffle (Fisher–Yates), then take the first ones.
  for (let i = tickets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tickets[i], tickets[j]] = [tickets[j], tickets[i]];
  }
  const sample = tickets.slice(0, count);

  // Each ticket goes through the triage endpoint, one at a time.
  const results: SmokeResult[] = [];
  for (const ticket of sample) {
    const start = Date.now();
    const response = await fetch(new URL("/api/triage", request.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket: { subject: ticket.subject, body: ticket.body } }),
    });
    const data = (await response.json()) as { triage?: TriageResult; usage?: Usage | null };
    const usage = data.usage ?? null;
    results.push({
      ticket_id: ticket.ticket_id,
      outcome: response.status,
      output: data.triage ?? null,
      expected:
        dataset === "labelled_100" ? { category: ticket.category ?? "", priority: ticket.priority ?? "" } : null,
      usage,
      cost_usd: costOf(usage),
      latency_ms: Date.now() - start,
    });
  }

  const outcome_counts: Record<string, number> = {};
  for (const r of results) outcome_counts[r.outcome] = (outcome_counts[r.outcome] ?? 0) + 1;

  // Only tickets with both a prediction and a label are compared.
  const pairs = results.flatMap((r) => (r.output && r.expected ? [{ output: r.output, expected: r.expected }] : []));
  const category_mismatches = pairs.filter((p) => p.output.category !== p.expected.category).length;
  const priority_mismatches = pairs.filter((p) => p.output.priority !== p.expected.priority).length;

  const category_confusion: Record<string, Record<string, number>> = {};
  for (const p of pairs) {
    const row = (category_confusion[p.expected.category] ??= {});
    row[p.output.category] = (row[p.output.category] ?? 0) + 1;
  }

  const costs = results.flatMap((r) => (r.cost_usd === null ? [] : [r.cost_usd]));

  const date = new Date().toISOString();
  const run: SmokeRun = {
    date,
    dataset,
    prompt_version: PROMPT_VERSION,
    model: LLM_MODEL,
    outcome_counts,
    category_accuracy: pairs.length ? (pairs.length - category_mismatches) / pairs.length : null,
    priority_accuracy: pairs.length ? (pairs.length - priority_mismatches) / pairs.length : null,
    category_mismatches,
    priority_mismatches,
    category_confusion,
    avg_latency_ms: Math.round(results.reduce((sum, r) => sum + r.latency_ms, 0) / results.length),
    total_cost_usd: costs.length ? costs.reduce((sum, c) => sum + c, 0) : null,
    results,
  };

  // runs/<date>-<prompt-version>-<model>.json, with characters not allowed in file names replaced.
  const fileName = `${date}-${PROMPT_VERSION}-${LLM_MODEL}`.replace(/[^a-zA-Z0-9._-]/g, "-") + ".json";
  await mkdir(RUNS_DIR, { recursive: true });
  await writeFile(path.join(RUNS_DIR, fileName), JSON.stringify(run, null, 2));

  return Response.json(run);
}