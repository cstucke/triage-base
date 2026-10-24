import { readFile } from "node:fs/promises";
import { LOG_FILE, type LlmCallLog } from "../../lib/log";

// Read the log file on every request, not once at build time.
export const dynamic = "force-dynamic";

type Totals = { calls: number; input: number; output: number; total: number; cost: number; noPrice: number };

async function readLog(): Promise<LlmCallLog[]> {
  let text: string;
  try {
    text = await readFile(LOG_FILE, "utf8");
  } catch {
    return []; // nothing logged yet
  }
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as LlmCallLog);
}

function totalsBy(rows: LlmCallLog[], key: (row: LlmCallLog) => string): [string, Totals][] {
  const groups = new Map<string, Totals>();
  for (const row of rows) {
    const t = groups.get(key(row)) ?? { calls: 0, input: 0, output: 0, total: 0, cost: 0, noPrice: 0 };
    t.calls += 1;
    if (row.usage) {
      t.input += row.usage.input;
      t.output += row.usage.output;
      t.total += row.usage.total;
      if (row.cost_usd === null) t.noPrice += 1;
      else t.cost += row.cost_usd;
    }
    groups.set(key(row), t);
  }
  return [...groups];
}

function TotalsTable({ title, label, groups }: { title: string; label: string; groups: [string, Totals][] }) {
  return (
    <section>
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>{label}</th>
            <th>Calls</th>
            <th>Input tokens</th>
            <th>Output tokens</th>
            <th>Total tokens</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(([name, t]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{t.calls}</td>
              <td>{t.input}</td>
              <td>{t.output}</td>
              <td>{t.total}</td>
              <td>{t.noPrice > 0 ? "no price set" : `$${t.cost.toFixed(6)}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function AdminPage() {
  const rows = await readLog();
  const errors = totalsBy(rows.filter((row) => row.status !== 200), (row) => String(row.status));

  return (
    <main className="chat">
      <h1>Admin: LLM calls</h1>
      <p>{rows.length} call(s) logged.</p>

      <section>
        <h2>Errors by status</h2>
        {errors.length === 0 ? (
          <p>No errors.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Calls</th>
              </tr>
            </thead>
            <tbody>
              {errors.map(([status, t]) => (
                <tr key={status}>
                  <td>{status}</td>
                  <td>{t.calls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <TotalsTable title="By prompt version" label="Prompt version" groups={totalsBy(rows, (r) => r.prompt_version)} />
      <TotalsTable title="By API" label="API" groups={totalsBy(rows, (r) => r.api)} />
      <TotalsTable title="By model" label="Model" groups={totalsBy(rows, (r) => r.model)} />

      <section>
        <h2>Calls</h2>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Prompt version</th>
              <th>API</th>
              <th>Model</th>
              <th>Status</th>
              <th>Input</th>
              <th>Output</th>
              <th>Total</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <td>{row.ts}</td>
                <td>{row.prompt_version}</td>
                <td>{row.api}</td>
                <td>{row.model}</td>
                <td>{row.status}</td>
                <td>{row.usage?.input ?? "not reported"}</td>
                <td>{row.usage?.output ?? "not reported"}</td>
                <td>{row.usage?.total ?? "not reported"}</td>
                <td>
                  {row.cost_usd !== null ? `$${row.cost_usd.toFixed(6)}` : row.usage ? "no price set" : "not reported"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}