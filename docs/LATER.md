# LATER

Append-only log of items deferred from the current sprint. The format:

```
## YYYY-MM-DD — short title
**Source:** who raised it (Al, claude, beta instructor name, etc.)
**Description:** what it is.
**Why deferred:** what about the current sprint prevented doing it now.
**Trigger to revisit:** what signal should bring it back to the top.
```

Operational rule from the Week 4 spec and `feedback_no_premature_merge`:
**every feature request, idea, or out-of-scope improvement surfaced during
beta goes here, not into the active sprint.** The scope-creep guard.

---

## 2026-05-12 — Mission 2 real refund test pending

**Source:** Al (deferred mid-Week-4 Mission 1 execution).

**Description:** Stage a real $1 USD test session in production, pay
through a real card via Stripe Connect, then refund via Stripe Dashboard
and verify the full webhook → `payments.refunded_*` columns → revenue
dashboard chain. Confirms that the `charge.refunded` webhook branch
added in Week 3 actually fires in production and that the dashboard
reflects refunds correctly.

**Why deferred:** Mission 1 (security hardening) ran long enough that
the live-money refund test got pushed. The code is in place and the
audit confirmed the wiring is correct; this is a verification step,
not an implementation step.

**Trigger to revisit:** Before the first real beta instructor processes
any payment. Catching a refund-pipeline bug after a real instructor's
real client refund would be embarrassing and trust-damaging. Schedule
before Mission 5 (beta onboarding).

**How to run:** see Mission 2 in the Week 4 build plan. Roughly:
create a paid session as Al, pay $1 from a second account, refund in
Stripe Dashboard, verify `payments.refunded_at` and `refunded_amount_cents`
get populated, verify `/os/revenue` shows the refund row and the
period totals are reduced accordingly, verify CSV export reflects it.

---

## 2026-05-12 — Wider `users` cross-user read leak (tier + status)

**Source:** Security audit (DEFER item, follow-up to Week 4 Mission 1).

**Description:** Even after migration 066 narrowed the column GRANT list,
`tribe_os_tier` and `tribe_os_status` remain readable cross-user.
Reveals "is X premium" and their subscription state. Not catastrophic
(premium users self-identify by their features), but not ideal.

**Why deferred:** Removing these columns from the cross-user grant
would break `useTribeOSPremiumGate`, which reads them client-side for
the user's own row. Postgres GRANT/REVOKE is role-based, not row-based,
so we can't say "self can read, others can't". Proper fix needs either
(a) replace the wildcard SELECT policy on `users` with a self-only
policy + a `users_public` view exposing safe columns for cross-user
reads, or (b) move the gate check to a server endpoint that uses
service-role internally. Either approach touches many call sites.

**Trigger to revisit:** Week 5+ hardening pass. If a beta instructor
asks "can other instructors see I'm a paying customer" — yes, today;
that conversation triggers a fix.

---

## 2026-05-12 — VAPID_PRIVATE_KEY "Needs Attention" in Vercel

**Source:** Surfaced during Week 3 pre-merge env review.

**Description:** Vercel flags `VAPID_PRIVATE_KEY` in the production env
list as "Needs Attention". Unclear cause; likely a rotation reminder or
a value format issue. Push notifications worked recently per Phase 1,
so it's probably not currently broken.

**Why deferred:** Unrelated to Tribe.OS work; would derail the sprint.

**Trigger to revisit:** Before any public launch. Push notifications
matter for the broader Tribe app, and a silent failure in the VAPID
chain is the kind of thing that goes unnoticed until reach drops.

---

## 2026-05-12 — Verónica Spanish review pending

**Source:** Memory note `project_key_people`; multiple `// ES PENDING
VERONICA REVIEW` markers across Week 1, 2, 3 UI code.

**Description:** Every Spanish string Claude Code produced during
Phase 2 is a starter-pack draft pending Verónica's review.

**Why deferred:** Verónica is on vacation per Al's note (date TBD on
return). Sprint cannot wait on the review.

**Trigger to revisit:** When Verónica returns. Process: she reads
through every file with the `// ES PENDING VERONICA REVIEW` marker,
sends edits as a list, Claude applies them, marker comment removed.

---

## 2026-05-12 — `supabase` CLI doesn't parse current `.env.local`

**Source:** Mission 1 of Week 4 setup attempt.

**Description:** `supabase db push` errored with "failed to parse
environment file: .env.local (unexpected character '\' in variable
name)". Likely a multiline JSON value (Google service account creds?)
that the CLI's env parser doesn't handle.

**Why deferred:** Migrations have been applied via the Dashboard SQL
Editor instead. Works, just slower than the CLI would be.

**Trigger to revisit:** If we ever need to script migration application
in CI. Or if Al wants the convenience back.
