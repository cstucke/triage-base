# Support ticket triage app

This repository is the starting point for an educational project in which
computer science students will build a support ticket triage application. The
planned application will use a large language model (LLM) from the backend to
help analyze incoming support requests and support the triage process.

The codebase is intentionally a basic skeleton. It provides a small chat
interface and server endpoint as a first step: before building the full triage
workflow, students can use this mock chat to validate the connection between
the application and an LLM provider.

## Current status

The chat feature is currently a mockup implemented as an echo service. The
client sends a message to `/api/chat`, and the server returns it in a
confirmation response. No LLM provider is called, and no LLM configuration is
needed to run this version.

This simple end-to-end flow is intended to make it possible to verify the
application's client-to-backend connection first, then integrate and validate
an LLM provider as an intermediate step, before implementing the complete
support ticket triage feature. The triage route and LLM client are placeholders
for that future work.

## Sample data

The `data/` folder contains two support-ticket datasets:

- **500 unlabelled tickets** in
  [`support_tickets_500.csv`](./data/support_tickets_500.csv) and
  [`support_tickets_500.json`](./data/support_tickets_500.json), for exploring
  and developing the triage workflow.
- **100 labelled tickets** in
  [`support_tickets_100_labelled.csv`](./data/support_tickets_100_labelled.csv)
  and
  [`support_tickets_100_labelled.json`](./data/support_tickets_100_labelled.json).
  These include triage annotations such as category, priority, and whether a
  ticket needs human review, making them useful for testing and evaluating
  triage approaches.

## Run locally

Requires Node.js 20.9 or newer.

```sh
npm install
npm run dev
```

Open http://localhost:3033 and send a message. Both `npm run dev` and
`npm run start` use port 3033.

The Send button is disabled when the message is empty or contains only spaces,
and while a request is in progress.

The client posts `{ "message": "your text" }` to `/api/chat`. The App Router
handler in `app/api/chat/route.ts` returns
`{ "answer": "Hello, you just said: your text" }`. Invalid JSON or an
empty/non-string message returns HTTP 400 with an `error`.

## Checks

```sh
npm run typecheck
npm run build
```

### Architecture
- [x] One LLM module: `lib/llm.ts` builds the only OpenAI client. Routes use it; no SDK calls in components.
- [ ] Prompts live in one place, with a `PROMPT_VERSION`: partial. The triage prompts (v1, v2) and their versions are in `lib/prompt.ts`, but the chat system prompt is still in `app/api/chat/route.ts`.
- [x] All provider settings come from configuration: base URL, key, model, structured-output mode and prices are read from `.env.local`.

### Error handling
- [x] Every failure in the error table maps to one status, one safe message and one error code (`/api/triage`).
- [x] Timeouts and retries are set explicitly: `timeout: 30_000` (per attempt) and `maxRetries: 1` in `lib/llm.ts`.
- [x] No stack trace or provider detail reaches the browser: errors are logged on the server only.

### Security
- [x] The key is used only on the server: only server files import `lib/llm.ts` (the triage page imports a type only).
- [x] `.env.local` is ignored by git: `git check-ignore -v .env.local` prints `.gitignore:5:.env*       .env.local`.
- [x] **Fixed:** the API rejects over-long input with `400` before any provider call (ticket body over 5,000 characters, `/api/triage`).
- [x] Logs contain no key and no ticket text: `logs/llm-calls.jsonl` stores only time, route, API, prompt version, model, status, tokens and cost.
- [x] The injection tickets do not change the category, priority or format of the answer: not verified yet (the smoke runs so far ended in `429`).