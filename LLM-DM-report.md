# LLM vs Decision Model: report

Support Triage App, AI Systems Integration & Operations (EPITA 2026): Activity 10 and DM Assignment.

## 1. Decision Model research

| Option | Hosted? | Free? | Notes |
|---|---|---|---|
| **vLLM Semantic Router: Decision 3.0** (`vllm-sr/d3-turbo` 27B, `d3-flash` 9B, `d3-mini`, `d3-nano`, `d3-lite`, `d3-edge`) | Yes | **Yes**: "Free API", one-click key, no account | `POST /v1/systemone` (`/v1/decisions` is an alias). Generous per-key limits (see below). Sources: https://decision.vllm-sr.ai/ , https://decision.vllm-sr.ai/docs |
| Cloudflare Workers AI: Clef / Clef-flash | Yes | Yes, within 10,000 neurons/day | Needs a Cloudflare account; endpoint not confirmed. Source (third-party): https://www.eesel.ai/blog/cloudflare-clef-pricing |
| TypeSafe AI: Jev (direct) | Yes | No | $42 per billion input tokens; early access. https://typesafe.ai/ |
| OpenRouter: `typesafe/jev-1.13` | Yes | No | $0.042 per 1M input tokens. https://openrouter.ai/typesafe/jev-1.13 |
| OpenAI: Decisions API (gpt-6-luna) | Yes | No free tier found | $0.10 per 1M input tokens, public beta (third-party source). https://www.highcircl.com/en/blog/openai-decisions-api |
| Liquid AI: d1 (Vercel AI Gateway) | Yes | No free credits listed | $0.02 per 1M input tokens. https://vercel.com/ai-gateway/models/d1.md |
| Perplexity: pplx-decider | Not confirmed | Not confirmed | Found only on third-party directories |
| AWS: Strands Decider | No (open model) | n/a | Not a hosted service |

Per-key limits for `vllm-sr/d3-flash` (https://decision.vllm-sr.ai/api/info, 2026-10-24): 720 requests/min, 750,000 tokens/min, 432,000 requests/day, 16 concurrent requests, 32,000 characters of state, 255 options.

**Selected:** vLLM Semantic Router Decision 3.0, model **`vllm-sr/d3-flash`**.
- **Why vLLM-SR:** it was the only option confirmed free from the provider's own site, with no account or payment method. Its limits are far above what this assignment needs.
- **Why d3-flash:** it has published benchmark scores, while d3-turbo's are marked as estimates. It shares the larger per-IP token pool.
- **Caveat:** `/api/info` reports `"logging": {"enabled": true}`, so the provider logs requests. That's acceptable here because the tickets are synthetic.

## 2. Integration strategy choice

**What the DM can and cannot do in our triage app**
- It **can** choose `category` (4 options) and `priority` (3 options) from closed sets, with probabilities.
- It **cannot** write `summary` or `suggested_action`. Per the deck, a DM "cannot answer outside the options you gave it" and is not "able to write, summarize, explain, plan or reason in several steps".

**Strategies** (selectable on `/triage` and on the `/smoke` runner; the browser sends only the strategy name, and the server decides what to call):

| Strategy | What happens | Response |
|---|---|---|
| `llm` | Existing triage v2 (`triage-v2`), unchanged | `{ category, priority, summary, suggested_action }` (`TriageSchema`) |
| `dm` | The DM (`vllm-sr/d3-flash`) chooses `category` and `priority` | `{ category, priority }` only (`DmTriageSchema`, a separate Zod shape) |
| `dm+llm` | The DM chooses `category` and `priority`; the LLM then writes `summary` and `suggested_action` for that ticket, given the DM's choice (`triage-dm-llm-v1`) | Full `TriageSchema` |

**Why:** "Language models write. Decision models choose." The closed-set choices go to the DM. The text, which the DM cannot produce, goes to the LLM. `dm+llm` returns the full triage result while the choice itself stays with the DM.

**How it is integrated**
- One DM client, `lib/dm.ts`, called from `/api/triage` only. It uses a plain `fetch` to `POST ${DM_BASE_URL}/v1/systemone`, because the chat SDK does not apply to a decision endpoint. Settings come from `.env.local` (`DM_BASE_URL`, `DM_API_KEY`, `DM_MODEL`, `DM_PRICE_*`), and the key is read on the server only.
- Request: `state` is `subject + "\n\n" + body`. Two `choice` questions (`category`, `priority`) carry the decision guidance as data in their `criteria` (`DM_CRITERIA_VERSION = "dm-criteria-v1"`, `lib/prompt.ts`). The existing over-length `400` check runs before any DM call.
- Validation: the DM response is checked with Zod, using a schema built from the provider docs. A missing answer, an `invalid_question` answer or a value outside the allowed options gives `502 invalid_model_output`. In `dm+llm`, the LLM's text is checked with Zod and the merged result must pass `TriageSchema`.
- Errors map onto the Activity 4 table:
  - 429 → `429 rate_limited`
  - 502, 503 or a network error → `502 triage_unavailable`
  - 504 or our own timeout → `504 triage_timeout`
  - 400, 401 or 403 → `500 internal_error`
- Timeout is 25 s per attempt, below the provider's 30 s. There is one retry on 429, 502, 503 or a network error, after the provider's `Retry-After`.
- Probabilities and confidence are not shown in the UI. They are kept in the run files (`dm_answers`).
- Logging (`logs/llm-calls.jsonl`) and `/admin` record the strategy and the model(s) for every call and run.

## 3. Results

Labelled dev set, 2026-10-24. Run files:
- `llm`: `runs/2026-10-24T20-13-08.555Z-triage-v2-gemini-3.5-flash-lite.json`
- `dm`: `runs/2026-10-24T20-12-38.976Z-dm-criteria-v1-vllm-sr-d3-flash.json`
- `dm+llm`: `runs/2026-10-24T20-13-36.803Z-triage-dm-llm-v1-vllm-sr-d3-flash-gemini-3.5-flash-lite.json`

| | `llm` | `dm` | `dm+llm` |
|---|---|---|---|
| Model(s) | gemini-3.5-flash-lite | vllm-sr/d3-flash | vllm-sr/d3-flash + gemini-3.5-flash-lite |
| Prompt / criteria version | triage-v2 | dm-criteria-v1 | triage-dm-llm-v1 |
| Tickets | 5 (random sample) | 100 (all) | 5 (random sample) |
| Outcome counts | 200: 5 | 200: 99, 400: 1 | 200: 5 |
| Category accuracy | 80% (4/5) | 88.9% (88/99) | 100% (5/5) |
| Category mismatches | 1 | 11 | 0 |
| Priority accuracy | 60% (3/5) | 72.7% (72/99) | 60% (3/5) |
| Priority mismatches | 2 | 27 | 2 |
| Average latency per ticket | 4,509 ms | 159 ms (median 143, max 426) | 4,165 ms |
| Average tokens per ticket | LLM 172 in / 78 out | DM 503 in / 0 out | DM 460 in / 0 out + LLM 195 in / 57 out |
| Cost | no price set (`LLM_PRICE_*` empty) | $0 (free tier) | DM $0 (free tier); LLM part no price set |

The `400` in the `dm` run is `TCK-10308`, whose body is over 5,000 characters. Our API rejects it before any provider call, so `dm` accuracy is over 99 tickets.

`dm` category confusion (label → prediction, 99 tickets):

| Label \ predicted | billing | technical_bug | account | feature_request |
|---|---|---|---|---|
| billing | 22 | 1 | 1 | 0 |
| technical_bug | 0 | 27 | 0 | 4 |
| account | 0 | 5 | 18 | 0 |
| feature_request | 0 | 0 | 0 | 21 |

`dm` priority mismatches (27): medium → high 9, medium → low 8, high → medium 6, low → medium 3, high → low 1.

Same-ticket checks (from the run files):
- On the 5 `llm` tickets, the `dm` run got category 4/5 and priority 4/5 (`llm`: 4/5 and 3/5). Both predicted `technical_bug` for TCK-10357 (label `account`).
- On the 5 `dm+llm` tickets, the DM's category, priority and probabilities were identical to the `dm` run's.

DM confidence (`dm` run, mean):
- **Category:** 0.84 on the 88 correct answers, 0.42 on the 11 wrong ones.
- **Priority:** 0.35 on the 72 correct answers, 0.22 on the 27 wrong ones.

## 4. Analysis

- **In `dm+llm` the DM chooses, so its accuracy is the DM's.** On the 5 overlapping tickets, the DM's choices and probabilities were identical to the `dm` run's. `dm+llm`'s 5/5 and 3/5 are a small sample of the DM's 88.9% / 72.7%, not a separate result. What `dm+llm` adds is the summary and suggested action, at the cost of one LLM call: 4,165 ms average instead of 159 ms, plus about 252 LLM tokens per ticket.
- **Latency:** every `dm` ticket (max 426 ms) was faster than every ticket in the two runs that call the LLM (fastest 2,636 ms).
- **Accuracy:** the `dm` run (99 tickets) is the only measurement large enough to rely on. The 5-ticket `llm` sample cannot rank `llm` against `dm`. On those same 5 tickets, `dm` matched `llm` on category (4/5) and got one more priority right (4/5 vs 3/5).
- **Agreement is not correctness:** `llm` and `dm` agreed on TCK-10357 (`technical_bug`), and both were wrong (label `account`). account → technical_bug is also the DM's most common category error (5 of 11).
- **Priority is the weak spot:** 27 of 99 priorities were wrong, almost all of them involving `medium`.
- **Confidence is not always honest:** category confidence separated right from wrong answers (0.84 vs 0.42), so it could flag tickets for human review. Priority confidence was low even on correct answers (0.35), so it cannot be read as the probability of being right.
- **Cost:** the DM is free on this tier ($0) and reports input tokens only (output is always 0). LLM cost cannot be compared in dollars because no LLM price is configured (Gemini free tier). In tokens, `llm` used about 250 per ticket, and `dm+llm` about 252 LLM tokens plus about 460 DM tokens.
- **Vendor numbers are vendor numbers:** the d3-flash benchmark scores in section 1 are the provider's. The 88.9% / 72.7% above are ours, measured on our dev set.
- **Limits of this evaluation:**
  - The `llm` and `dm+llm` samples are 5 tickets each, on different random tickets, because of the Gemini free-tier limit of 20 requests per day.
  - One ticket was rejected by our own length limit.
  - Only the dev set was used, with no hold-out set.
  - The DM's criteria include option descriptions and two slide rules that the triage-v2 prompt does not have, so `llm` vs `dm` is not a like-for-like comparison.
