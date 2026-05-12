# Week 3 Missions — Pre-Beta Polish (Autonomous Build Day)

Goal: tighten the screws on top of the Weeks 1–2 integration without
requiring user-execution items. Everything in this pack is pure code
or documentation work — no Stripe Dashboard taps, no outreach emails,
no real-device verification needed. Real-device verify remains
pending whenever the user has 15 minutes.

Branch: `feature/tribe-os`. No merge to main until the full
integration is complete and Al gives explicit ask.

## Mission status

| #   | Mission                                                                             | Status  | Commit        |
| --- | ----------------------------------------------------------------------------------- | ------- | ------------- |
| 1   | Extend leak test to cover gym SQL functions + gym/coach RLS                         | ✅ done | `b2bea6b`     |
| 2   | Read-only `/os/coaches` roster page                                                 | ✅ done | `274d2b7`     |
| 3   | Editable `/os/gym` settings page (owner-only PATCH)                                 | ✅ done | `9628877`     |
| 4   | Update `SECURITY_AUDIT_2026-05-12.md` + `PRE_MERGE_CHECKLIST.md` to reflect 068–072 | ✅ done | (this commit) |

## What shipped

### Mission 1 — leak test extension

Five new test phases land. Smoke: A can call `gym_revenue_totals` +
`gym_revenue_buckets` for their own gym (regression catcher for the
membership check in migration 071). Cross-user: B cannot query A's
gym totals/buckets (rejected 42501), B cannot SELECT A's gym row
(RLS blocks), B cannot SELECT A's coach roster (RLS blocks).
Expected next run: **16 PASS / 0 FAIL / 4 WARN**. Closes the DEFER
item from `LATER.md`.

### Mission 2 — `/os/coaches`

New API route `GET /api/tribe-os/coaches` + new page. Owner row gets
a crown icon and green border; other coaches show their initial.
Empty state ("Only you for now") covers the single-coach default.
No-gym error state covers the edge case.

**Known limit per audit finding M:** the page currently renders only
the caller's own coach row because `gym_coaches_member_select`
collapsed to `user_id = auth.uid()` after the recursion hotfix.
Functional for Week 3 (every gym has one coach today). The proper
fix is a SECURITY DEFINER `list_gym_coaches(p_gym_id)` function;
added to `LATER.md` as a Week 4 hardening item.

### Mission 3 — `/os/gym`

GET returns the gym row, PATCH is owner-only. Page renders name
(editable), slug (read-only), timezone (curated select), default
currency. Non-owner coaches see the form in read-only mode with an
explanatory notice. Common LATAM+US timezones in the picker; the
gym's current value is preserved at the top if outside the curated
set.

### Mission 4 — Docs

`SECURITY_AUDIT_2026-05-12.md` gets a "Post-gym-tenant integration
audit" section covering migrations 068–072, the new RLS surface,
the new SECURITY DEFINER functions, per-route audit for the new
routes, and Findings J–N (no FIX or CRITICAL items added).
`PRE_MERGE_CHECKLIST.md` gets new Security + Migrations + Gym-tenant
integration sections.

## Deferred to Week 4+ (in LATER.md)

- **SECURITY DEFINER `list_gym_coaches` function** — fixes Audit
  finding M so the `/os/coaches` page can show all coaches in a
  multi-coach gym without hitting the recursion trap on the
  `gym_coaches` policy.
- Beta launch resumption (Week 4 Missions 2–6 from the original
  pre-integration plan): real $1 USD refund test, mobile device
  verification, outreach, onboarding 1–3 instructors, retrospective.

## Verification gates

- [x] tsc --noEmit clean after each commit
- [ ] Leak test run by the user produces **16 PASS / 0 FAIL / 4 WARN**
      (the 4 WARN entries are the documented payout/PII columns)
- [ ] Real-device verify on Vercel preview at HEAD includes:
  - `/os/dashboard` loads with the at-risk widget (now in the
    expected empty state since no clients exist yet) plus the new
    Coaches + Gym settings buttons
  - `/os/coaches` shows you as the gym owner
  - `/os/gym` shows the editable form; changing the gym name persists
    via the PATCH route
