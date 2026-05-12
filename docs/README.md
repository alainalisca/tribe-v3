# docs/

Operational documentation. One file per concern. New docs land here
unless they're a long-lived architectural reference (those go in
`engineering-standards.md` at the repo root) or a skill (those go in
`.claude/skills/`).

## Active

Phase 2 Tribe.OS — Weeks 1-4 of the post-trip build, plus the
Weeks 1-3 gym-tenant integration on top. All on `feature/tribe-os`.

- **`LATER.md`** — Append-only log of deferred items, feature
  requests, and scope-creep candidates surfaced during a sprint.
  The operational scope-creep guard. Read this first when triaging
  new asks.
- **`SECURITY_AUDIT_2026-05-12.md`** — Pre-beta security
  walkthrough of all Phase 2 code, with the post-gym-tenant
  integration audit appended at the bottom (covers migrations
  068–073, new RLS surfaces, new SECURITY DEFINER functions, and
  the new /api/tribe-os/{coaches,gym,clients/at-risk} routes).
  PASS / FIX / DEFER per item.
- **`WEEK_1_MISSIONS.md`** — Gym-tenant additive foundation:
  schema, backfill, dual-path RLS, DAL, onboarding wiring.
- **`WEEK_2_MISSIONS.md`** — Multi-coach activation + member
  roster enrichment (status, health notes, at-risk widget).
- **`WEEK_3_MISSIONS.md`** — Pre-beta polish autonomous build day:
  leak-test extension, /os/coaches roster, /os/gym settings,
  audit + checklist docs, plus bonus mission A
  (`list_gym_coaches` SECURITY DEFINER function), B (PostHog
  observability sweep), C (this playbook).
- **`INSTRUCTOR_PLAYBOOK_BETA.md`** — 5-minute self-contained doc
  to hand a beta candidate before onboarding. Bilingual EN+ES.
  Covers what Tribe.OS does today, what's coming, what we're
  asking from the instructor, and the post-beta pricing choice.
- **`BETA_OUTREACH.md`** — Candidate-selection SQL, outreach
  tracking table, EN+ES message templates, and per-candidate
  onboarding checklist for Mission 4 of the Week 4 spec.
- **`BETA_LOG.md`** — Day-by-day notes from the beta. One section
  per onboarded instructor + a cross-cutting platform-changes
  log. Source material for the retrospective.
- **`MOBILE_VERIFICATION.md`** — Surface × device matrix for
  pre-beta mobile testing (iOS Capacitor, Android Capacitor,
  iOS Safari, Android Chrome). PASS / COSMETIC / MAJOR / CRITICAL.
- **`BETA_RETROSPECTIVE_TEMPLATE.md`** — Empty mold for the
  end-of-Week-4 retrospective. Copy to `BETA_RETROSPECTIVE_YYYY-MM-DD.md`
  at retrospective time.
- **`PRE_MERGE_CHECKLIST.md`** — Operational gate for merging
  `feature/tribe-os` → `main`. Walks code health, security,
  migrations, beta validation, gym-tenant integration, operational,
  communication. Use before requesting the merge from Al.

## Reference

Long-lived documents that survive sprint cycles.

- **`ADR.md`** — Architecture decisions, append-only.
- **`ANALYTICS_FUNNELS.md`** — PostHog funnel definitions.
- **`INCIDENT_RESPONSE.md`** — Outage runbook.
- **`SECRETS_ROTATION.md`** — Key-rotation procedures.
- **`STRIPE_HANDOFF.md`** — Stripe Connect setup notes.
- **`TRIP_HANDOFF.md`** — End-of-trip state snapshot (April 2026).

## Audit-driven

- **`Claude_Code_5_Day_Audit_Fix_Prompts.md`** — Original
  external audit findings + per-finding prompts. Largely
  resolved by Phase 1 work; kept for traceability.

## Archive

- `archive/` — Specs and notes from previous sprints, kept for
  reference, not actively maintained.
