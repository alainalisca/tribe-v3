# T-EMAIL1: RFC 8058 headers on the two gym-owner digests

**Filed** 2026-09-21. **Priority** low. **Not started.**

## What

`lib/email/intelligenceDigest.ts` (daily, `0 7 * * *`) and
`lib/email/weeklySummary.ts` (weekly, `0 8 * * 1`) are the only recurring
emails left without one-click unsubscribe headers.

They are **not** in the same position as the athlete-facing emails that were
fixed on 2026-09-21, and the difference is why this is a ticket rather than a
defect:

- **They already have an off switch.** Both gate on
  `gyms.intelligence_email_enabled` (migration 081, `NOT NULL DEFAULT true`),
  checked by `lib/ai/digest-sender.ts` before the digest and inside
  `maybeSendWeeklySummary` for the summary.
- **The weekly summary already tells the reader where it is**, in both
  languages: _"Don't want these? Turn them off in /os/gym settings."_

So a recipient can stop them. What is missing is the one-click path.

## Why the athlete opt-out is the wrong instrument

`notification_preferences.email_unsubscribed_at` and its `unsub_token`
(migrations 188/189) are keyed by `user_id` and mean "this person does not want
mail from Tribe". These two digests go to a **gym owner about their business**,
keyed by `gyms.owner_user_id`. Reusing the athlete token would mean an owner
clicking unsubscribe in a business digest also silences their session
reminders, which is not what they asked for, and would mean one gym's owner
opting out of a product another gym pays for if they own both.

The opt-out has to be **gym-scoped**.

## Work

1. A per-gym unsubscribe token. `gyms.unsub_token`, same shape as 189: a
   default for new rows, a backfill for existing ones, and a guard asserting
   `count(distinct) = count(*)` — 189's load-bearing arm, because a single
   `gen_random_uuid()` evaluated once for the whole UPDATE would give every gym
   the same token and resolve a click to the wrong business.
2. Extend `/api/unsubscribe` to resolve a gym token as well as a user token,
   setting `intelligence_email_enabled = false`. Keep one route: a second
   unsubscribe endpoint is the copy that goes stale.
3. `unsubHeaders(...)` on both sends, and turn the weekly summary's
   `optOutLine` into a real `<a href>` — assert on the anchor, not on the URL
   appearing somewhere, since a broken anchor still contains the string.
4. `intelligenceDigest` has no opt-out line in its copy at all. Add one.

## Not in scope

The other 13 `resend.emails.send` call points were swept on 2026-09-21 and
classified: nine are transactional or admin-only and need no opt-out
(`notify-admin-signup`, `feedback/widget`, `send-guest-confirmation`,
`welcome-email`, `signUpInvite`, `coachAddedYouWelcome`, `tribeOsBetaWelcome`,
`tribeOsWaitlist`, `passLead`), and four were fixed that day
(`send-weekly-recap`, `send-inactive-nudge`, `send-attendance-notification`,
plus the one-off sports nudge).
