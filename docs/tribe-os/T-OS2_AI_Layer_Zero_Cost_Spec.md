# T-OS2: Tribe.OS AI Layer, Built at Zero Cost

**Ticket:** T-OS2
**Priority:** P1, after T-OS1 is merged into `tribe-os/main`.
**Type:** Feature. AI message drafter and weekly retention brief, built behind a provider abstraction so the whole feature can be developed, tested and piloted **without paying for a single AI call**.
**Scope:** Runs on `feat/t-os2-ai` cut from `tribe-os/main`, against the shared database under the T-OS0 rules (Class A migrations only before merge, no dual writers). **The T-OS0 HARD LINE applies in full and overrides this document.**

> **Revision note (2026-09-24):** main already has `lib/ai/` (`config.ts` with model ids, pricing and rate limits, `logger.ts`, `data-access.ts`, `insight-templates.ts`, `digest-sender.ts`, `run-intelligence.ts`) and an `agent_run_log` table (075). No code calls the Anthropic API today. Build this ticket INTO that structure: the provider abstraction goes in `lib/ai/provider/`, logging uses the existing `aiLogger` and `agent_run_log` (insert new rows with new `feature` values; add nullable columns only if needed, Class A), and budgets reuse `RATE_LIMITS` plus a new per-gym dollar cap. The weekly brief EXTENDS the existing weekly-summary and digest code paths on the branch rather than creating a parallel one. The drafter reads T-OS1's `client_retention_v2` and writes `client_touches`. Also correct `MODEL_PRICING` for Haiku 4.5 in `config.ts` (it currently holds older, lower Haiku prices) after checking Anthropic's pricing page.
> **Owner decision (Al, 2026-09-23):** add AI features over time; incur no AI fee until everything is built correctly and functioning. The paid provider is switched on by Al, by hand, at a moment he chooses, and never by an agent.

---

## Design principle: facts from SQL, words from the model

The model never decides who is at risk, never computes a number and never invents a fact. T-OS1's retention function produces a structured, verified payload (who, why, how many visits, which milestone). The model's only job is to turn that payload into warm, natural Spanish. This does three things:

1. It kills hallucination risk on the part that matters (names, numbers, dates).
2. It makes every feature work with **no model at all**: a template renderer produces a plain but correct version.
3. It makes the model swappable: fake, local, or paid, same inputs, same checks.

---

## Step 1: Provider abstraction

`lib/tribe-os/ai/provider.ts`:

```ts
export interface AiProvider {
  name: 'fake' | 'ollama' | 'anthropic';
  generate(input: {
    system: string;
    user: string;
    maxOutputTokens: number;
    temperature?: number;
  }): Promise<{ text: string; inputTokens: number; outputTokens: number }>;
}
```

Three implementations, selected by `TRIBE_OS_AI_PROVIDER`:

1. **`fake` (default everywhere, used by all tests).** Deterministic. Renders the prompt's structured payload through a Spanish template. No network. Zero cost. This is what the branch runs by default and what the Leo pilot can start on.
2. **`ollama` (optional, local dev on Al's Mac only).** Calls `http://localhost:11434` (free, open-source, runs on the Mac). Suggested model: a 7B to 8B instruct model with good Spanish (for example `qwen2.5:7b-instruct` or `llama3.1:8b`); report which you tested. It only works from the local dev server, never from a Vercel deployment. It exists so Al can judge real generated copy for free.
3. **`anthropic` (built, tested with mocks, HARD-DISABLED).** Uses the official SDK (free package). It throws before any network call unless ALL of: `TRIBE_OS_AI_LIVE === 'true'`, `ANTHROPIC_API_KEY` present, the gym has a monthly cap above 0 in a new nullable `gyms.ai_monthly_cap_usd` column (Class A), and the budget check passes. No agent ever sets `TRIBE_OS_AI_LIVE` or adds an API key. Default model constant: Haiku (cheapest current tier), in one place.

## Step 2: Budget guard and run log (built now, even though spend is $0)

- Use the existing `agent_run_log`. Report its columns in the PR. If it lacks `provider`, `status` values for `blocked_budget` / `blocked_disabled` / `validation_failed`, or an estimated cost column, add nullable columns (Class A). Never update rows main writes; only insert new rows with `feature` = `draft_message` or `weekly_brief`.
- `checkBudget(gymId)` runs before every `anthropic` call: sums this calendar month's `est_cost_usd` for the gym; blocks at the cap and logs `blocked_budget`. Fake and ollama calls log with cost 0 so the observability is exercised from day one.
- Price constants per model in one file with a comment linking Anthropic's pricing page and the date checked.
- Per-gym daily call ceiling (default 200) as a second circuit breaker.

## Step 3: Feature A, the message drafter

On `/os/retention` and `/os/members/[id]`, each at-risk or good-news member gets a **"Redactar mensaje"** button.

- Input payload (built server-side from T-OS1 data): first name, gym name, owner or coach first name, `reasons[]`, days since last visit, usual weekly rate, membership length, milestone if any, the gym's tone setting (`cercano` | `motivador` | `directo`), and the gym's saved example messages if any.
- Output: two short WhatsApp-style variants, Colombian Spanish, tú form by default (setting), maximum 320 characters each, no emojis unless the gym's setting allows, no guilt-tripping, no mention of prices or discounts unless the owner types it.
- Output validation before showing: every proper name in the output must appear in the input payload; no digits except those in the payload; length limit; banned phrases list. On failure, log `validation_failed` and fall back to the template version. The owner never sees an unvalidated draft.
- The owner edits in a text box, then taps "Abrir en WhatsApp" (`wa.me` link, same as T-OS1). **Nothing is ever sent automatically.** No WhatsApp Business API (it has per-message fees).
- On send, record a `gym_member_touches` row with `ai_assisted = true` and whether the draft was edited. That edit rate is the quality metric.

## Step 4: Feature B, the weekly retention brief

- `buildWeeklyBrief(gymId, weekStart)` returns a structured object from SQL: members at high risk (with reasons), new members under 30 days and their visit counts, milestones this week, classes whose attendance fell more than 25% against their 4-week average, contacted members who returned within 14 days (the win count), and totals.
- The provider turns that object into a short brief in Spanish: a headline, then "Habla con ellos esta semana", "Celebra", "Ojo con", and "Lo que funcionó". The fake provider renders the same sections from a template.
- Page `/os/brief`, with a "Generar resumen de esta semana" button (previews have no cron; T-OS0 Step 6). Cache the result per gym per week in a new table `gym_weekly_briefs` (Class A).
- A Monday cron is written but only registered for production at merge time. Email delivery stays off (`EMAIL_MODE=log`).
- Autonomy tiers, made explicit in code (`lib/tribe-os/ai/autonomy.ts`): **autonomous** = generate the brief and drafts; **approval** = anything that reaches a member; **never** = anything involving money, cancellations, health, or sending without a human tap.

## Step 5: Prompts and evaluation

- Prompts in `lib/tribe-os/ai/prompts/`, one file per feature, version constant in each, recorded in `agent_run_log`.
- `tests/fixtures/os-ai/`: 12 member scenarios (steady, fading, sudden stop, new and struggling, new and thriving, milestone 100, anniversary, returning after touch, sparse data, name with accents, member with no phone, coach instead of owner as sender).
- `npm run os:eval`: runs every fixture through the current provider, applies the validators, writes `docs/os-ai-eval-<provider>-<date>.md` with each output for Al to read. With `fake` it runs in CI. With `ollama` Al runs it locally to judge tone.

## Acceptance checks

1. With `TRIBE_OS_AI_PROVIDER=fake`, both features work end to end for the test gym, and `agent_run_log` shows rows with cost 0.
2. With `anthropic` selected but `TRIBE_OS_AI_LIVE` unset, every call is blocked before the network and logged as `blocked_disabled` (test with a network mock that fails the test if called).
3. With `TRIBE_OS_AI_LIVE=true` in a unit test and a mocked SDK, a cap of 0 blocks and a cap above 0 allows, and the month's spend is summed correctly.
4. Validation rejects an output containing a name or number not in the payload and falls back to the template.
5. `os:eval` report produced for `fake`, and for `ollama` if Al has run it.
6. `os:guard` still passes; it now also fails on `anthropic` without `TRIBE_OS_AI_LIVE=true`.

## Cost implications

- **Development and pilot on `fake`: $0.** On `ollama`: $0 (runs on Al's Mac; needs roughly 8 GB of free memory for a 7B to 8B model).
- **`anthropic`, only when Al turns it on:** the drafter and brief for a gym of about 150 to 200 members should cost a few dollars a month at Haiku pricing, and the per-gym cap enforces the ceiling in code. Recheck prices on Anthropic's pricing page on the day it is switched on.
- No WhatsApp API, no SMS, no new email volume.

## Out of scope

- Automatic sending of any message.
- Churn prediction models (T-OS5, needs months of history).
- Fine-tuning, embeddings, vector stores, streaming UI.
- Switching the live provider on. That is Al's manual step, after the merge gate, or for the test gym when he decides.
