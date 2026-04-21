# Analytics Funnels

**Owner:** Al
**Last updated:** 2026-04-21 (LR-04 launch readiness)

This file is the reference for the three core conversion funnels Tribe tracks in
PostHog. The dashboard setup (creating the funnels in the PostHog UI) happens
in Part 2 of the Launch Readiness spec (task D-05). This file is the
contract the dashboard builds against: the exact event names to select and
the order they fire in.

If you add, rename, or remove a funnel-critical event, update this file in
the same PR — otherwise the PostHog dashboard silently breaks.

---

## Where events live in code

- Event taxonomy: `lib/analytics.ts` (the `EventName` union)
- Emit wrapper: `trackEvent(name, properties?)` in the same file
- Identification: `identifyUser(profile)` called once per session
- No component imports `posthog` directly — always go through
  `@/lib/analytics`

---

## Funnel 1 — Signup

**Goal:** measure drop-off between a visitor clicking "Sign Up" and
landing on the home feed as a fully onboarded user.

| Step | Event                    | Fires in                                                                                               |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| 1    | `signup_started`         | `app/auth/useAuthHandlers.ts` on email/Google/Apple signup click                                       |
| 2    | `signup_email_submitted` | Same file, after email form is POSTed to `/api/auth/signup` (email flow only — OAuth skips this step)  |
| 3    | `signup_email_verified`  | `app/auth/callback/page.tsx` when a NEW user's callback runs (fires once per user, not on every login) |
| 4    | `onboarding_started`     | `components/OnboardingModal.tsx` on mount                                                              |
| 5    | `onboarding_completed`   | Same component, when the user finishes step 4 OR closes with the X                                     |
| 6    | `profile_first_save`     | `app/profile/edit/useEditProfile.ts` — first successful save only, deduped via localStorage            |

**Notes for the PostHog builder:**

- Use strict sequential funnel; a user skipping a step means they dropped out.
- OAuth users don't fire `signup_email_submitted` or `signup_email_verified`.
  If you want an OAuth-only funnel, filter on `method: 'google' | 'apple'`.
- `profile_first_save` is the "activation" definition. Anyone who reaches it
  is counted as an activated user for retention cohorts.

---

## Funnel 2 — Session Join

**Goal:** measure drop-off from discovering a session to being confirmed.

| Step | Event                    | Fires in                                                                                                                                                                             |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `session_viewed`         | `app/session/[id]/page.tsx` and `app/s/[id]/SessionShareClient.tsx`                                                                                                                  |
| 2    | `session_join_clicked`   | `hooks/useSessionActions.ts` — fires BEFORE auth gate, so both guests and authed users are counted at this step                                                                      |
| 3a   | `session_join_succeeded` | Same file, after RPC returns success and status is `confirmed` (not `pending`)                                                                                                       |
| 3b   | `session_join_failed`    | Same file, on RPC failure. Always carries `reason` property: `capacity_full`, `already_joined`, `self_join`, `invite_only`, `session_not_active`, `session_not_found`, or `unknown`. |

**Notes for the PostHog builder:**

- Funnel should end on `session_join_succeeded`. Use `session_join_failed`
  as a separate breakdown insight to watch which error codes are most common.
- `session_join_clicked` has a boolean `has_auth` property — segment by that
  to see guest-vs-authed intent separately.
- `session_joined` is the legacy name and still fires alongside
  `session_join_succeeded`; prefer the canonical name for new dashboards.

---

## Funnel 3 — Post-Session Rating

**Goal:** measure the view-to-submit conversion on the post-session rating
prompt, and break down submission failures.

| Step   | Event                  | Fires in                                                                                                                            |
| ------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1      | `rating_modal_shown`   | `components/PostSessionPrompt.tsx` on mount (fires exactly once per prompt session)                                                 |
| 2      | `rating_submitted`     | Same component, on successful INSERT into `reviews`                                                                                 |
| 2-fail | `rating_submit_failed` | Same component on error. Property `reason`: `already_reviewed` (Postgres 23505 unique violation) or `server_error` (anything else). |

**Notes for the PostHog builder:**

- If the rate of `rating_submit_failed` with `reason: already_reviewed` is
  non-trivial, surface a better "you already rated" UX upstream rather than
  letting users hit the failure.
- `rating_submitted` is the "session complete loop" signal — combined with
  `session_completed`, it's the best retention proxy.

---

## Adding a new funnel event

1. Add the name to the `EventName` union in `lib/analytics.ts`. Add a short
   comment explaining when it fires and which funnel it serves.
2. Emit it from the component/route where the user action actually happens.
   Include enough properties (session_id, reason, method, etc.) to make
   breakdowns useful.
3. Update this file with the new step.
4. After deploy, open PostHog → Insights → Funnels, find the relevant
   funnel, click Edit, add the step.

---

## Confirmed events NOT in any funnel

These are tracked for general analytics / breakdown, not for funnel
conversion rates:

- Session actions (`session_created`, `session_edited`, `session_cancelled`,
  `session_shared`, `session_completed`, `session_left`)
- Payment events (`payment_initiated`, `payment_completed`, `payment_failed`)
- Social (`connection_requested`, `message_sent`, `post_liked`, etc.)
- Discovery (`search_executed`, `filter_applied`, `neighborhood_selected`)

See `lib/analytics.ts` for the complete taxonomy.
