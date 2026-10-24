"use client";

import { useState, type FormEvent } from "react";
import type { Dataset, SmokeRun } from "../../lib/smoke";
import type { Strategy } from "../../lib/schema";

export default function SmokePage() {
  const [dataset, setDataset] = useState<Dataset>("labelled_100");
  const [count, setCount] = useState(5);
  const [strategy, setStrategy] = useState<Strategy>("llm");
  const [run, setRun] = useState<SmokeRun | null>(null);

  async function startRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRun(null);
    const response = await fetch("/api/smoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dataset, count, strategy }),
    });
    setRun(await response.json());
  }

  const labelled = run?.dataset === "labelled_100";

  return (
    <main className="chat">
      <h1>Smoke test</h1>
      <form onSubmit={startRun}>
        <label htmlFor="dataset">Dataset</label>
        <select id="dataset" value={dataset} onChange={(event) => setDataset(event.target.value as Dataset)}>
          <option value="labelled_100">Labelled set (100 tickets)</option>
          <option value="all_500">Full set (500 tickets)</option>
        </select>
        <label htmlFor="strategy">Strategy</label>
        <select id="strategy" value={strategy} onChange={(event) => setStrategy(event.target.value as Strategy)}>
          <option value="llm">llm: the LLM triages the ticket</option>
          <option value="dm">dm: the decision model chooses category and priority</option>
          <option value="dm+llm">dm+llm: the DM chooses, the LLM writes summary and action</option>
        </select>
        <label htmlFor="count">Number of tickets to sample at random</label>
        <input
          id="count"
          type="number"
          min={1}
          value={count}
          onChange={(event) => setCount(Number(event.target.value))}
        />
        <button type="submit">Run smoke test</button>
      </form>
      {run && (
        <section>
          <table>
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Outcome</th>
                <th>Predicted category</th>
                <th>Predicted priority</th>
                {labelled && (
                  <>
                    <th>Labelled category</th>
                    <th>Labelled priority</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {run.results.map((r) => (
                <tr key={r.ticket_id}>
                  <td>{r.ticket_id}</td>
                  <td>{r.outcome}</td>
                  <td>{r.output?.category ?? "-"}</td>
                  <td>{r.output?.priority ?? "-"}</td>
                  {r.expected && (
                    <>
                      <td>{r.expected.category}</td>
                      <td>{r.expected.priority}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <h2>Summary</h2>
          <p>Outcomes: {Object.entries(run.outcome_counts).map(([status, n]) => `${status}: ${n}`).join(", ")}</p>
          <p>
            Average latency: {run.avg_latency_ms} ms. Cost:{" "}
            {run.total_cost_usd === null
              ? "n/a"
              : run.total_cost_usd === 0
                ? "$0 (free tier)"
                : `$${run.total_cost_usd.toFixed(6)}`}
          </p>
          {labelled && (
            <p>
              Mismatched predictions: category {run.category_mismatches}, priority {run.priority_mismatches}.
            </p>
          )}
        </section>
      )}
    </main>
  );
}