"use client";

import { useState, type FormEvent } from "react";
import type { TriageResult } from "../../lib/schema";
import type { Usage } from "../../lib/llm";

type Version = "v1" | "v2";

// v1 returns the model's plain text as-is; v2 returns a Zod-checked object.
const ENDPOINTS: Record<Version, string> = {
  v1: "/api/triage/v1",
  v2: "/api/triage",
};

export default function TriagePage() {
  const [version, setVersion] = useState<Version>("v2");
  const [subject, setSubject] = useState("");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [body, setBody] = useState("");
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);

  async function submitTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSending || !body.trim()) return;

    setIsSending(true);
    setError(null);
    setTriage(null);
    setAnswer(null);
    setExplanation(null);

    try {
      const response = await fetch(ENDPOINTS[version], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: { subject, body } }),
      });
      const data: unknown = await response.json();

      if (!response.ok) {
        const detail =
          typeof data === "object" &&
            data !== null &&
            "error" in data &&
            typeof data.error === "string"
            ? data.error
            : "Unable to triage this ticket. Please try again.";
        throw new Error(detail);
      }

      if (version === "v1") {
        if (
          typeof data !== "object" ||
          data === null ||
          !("answer" in data) ||
          typeof data.answer !== "string"
        ) {
          throw new Error("The server returned an invalid reply. Please try again.");
        }
        setAnswer(data.answer);
      } else {
        // The server only sends results that passed Zod validation.
        const result = data as { triage: TriageResult; usage: Usage | null };
        setTriage(result.triage);
        setUsage(result.usage);
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to triage this ticket. Please try again.",
      );
    } finally {
      setIsSending(false);
    }
  }

  async function explainTriage() {
    setIsExplaining(true);
    setError(null);
    setExplanation("");

    try {
      const response = await fetch("/api/triage/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: { subject, body }, triage }),
      });
      if (!response.ok || !response.body) throw new Error("Explain request failed.");

      // Append the text as it arrives.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        setExplanation((previous) => (previous ?? "") + text);
      }
    } catch {
      setError("Unable to explain this triage. Please try again.");
    } finally {
      setIsExplaining(false);
    }
  }

  return (
    <main className="chat">
      <h1>Ticket triage</h1>
      <p>Paste a support ticket to get a category, priority, summary and suggested action.</p>
      <form onSubmit={submitTicket} aria-busy={isSending}>
        <label htmlFor="version">Triage version</label>
        <select
          id="version"
          value={version}
          onChange={(event) => setVersion(event.target.value as Version)}
          disabled={isSending}
        >
          <option value="v1">v1: plain text, no checks</option>
          <option value="v2">v2: JSON checked with Zod</option>
        </select>
        <label htmlFor="subject">Subject</label>
        <input
          id="subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          disabled={isSending}
        />
        <label htmlFor="body">Body</label>
        <textarea
          id="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={8}
          required
          disabled={isSending}
        />
        <button type="submit" disabled={isSending || !body.trim()}>
          {isSending ? "Triaging..." : "Triage"}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
      {answer !== null && (
        <section className="messages" aria-label="Triage result" aria-live="polite">
          <div className="message assistant">
            <strong>Model answer (v1, unchecked)</strong>
            <p>{answer}</p>
          </div>
        </section>
      )}
      {triage && (
        <section className="messages" aria-label="Triage result" aria-live="polite">
          <dl>
            <dt>Category</dt>
            <dd>{triage.category}</dd>
            <dt>Priority</dt>
            <dd>{triage.priority}</dd>
            <dt>Summary</dt>
            <dd>{triage.summary}</dd>
            <dt>Suggested action</dt>
            <dd>{triage.suggested_action}</dd>
            <dt>Tokens</dt>
            <dd>
              {usage
                ? `${usage.input} input, ${usage.output} output, ${usage.total} total`
                : "Not reported by the provider"}
            </dd>
          </dl>
          <button type="button" onClick={explainTriage} disabled={isExplaining}>
            {isExplaining ? "Explaining..." : "Explain"}
          </button>
          {explanation !== null && <p>{explanation}</p>}
        </section>
      )}
    </main>
  );
}