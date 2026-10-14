"use client";

import { useState, type FormEvent } from "react";
import type { TriageResult } from "../../lib/triage";

export default function TriagePage() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [triage, setTriage] = useState<TriageResult | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSending || !body.trim()) return;

    setIsSending(true);
    setError(null);
    setTriage(null);

    try {
      const response = await fetch("/api/triage", {
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

      // The server only sends results that passed Zod validation.
      setTriage((data as { triage: TriageResult }).triage);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to triage this ticket. Please try again.",
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="chat">
      <h1>Ticket triage</h1>
      <p>Paste a support ticket to get a category, priority, summary and suggested action.</p>
      <form onSubmit={submitTicket} aria-busy={isSending}>
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
          </dl>
        </section>
      )}
    </main>
  );
}
