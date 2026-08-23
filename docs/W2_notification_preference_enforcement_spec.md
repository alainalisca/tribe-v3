# W2: Notification preference enforcement

Implementation spec. No code in this document. The goal is that every notification
Tribe sends respects the user's saved preferences, and that the settings screen
tells the truth about what its toggles do.

## 1. Current state

### 1.1 The preference model

`notification_preferences` (one row per user, DAL in
[lib/dal/notificationPreferences.ts](../lib/dal/notificationPreferences.ts)) holds:

- Nine category flags: `session_reminders`, `session_updates`, `social_activity`,
  `messages`, `training_nudges`, `instructor_updates`, `challenges`, `marketing`,
  `weekly_recap`.
- Two channel master switches: `push_enabled`, `email_enabled`.

Defaults: every category is `true` except `marketing` (`false`); `push_enabled` is
`true`; `email_enabled` is `false`. A user with no row gets these defaults.

`TYPE_CATEGORY` maps each notification `type` string (for example `follow`, `like`,
`new_message`, `session_reminder`) to one category flag. Unmapped types fall through
to allowed.

### 1.2 The one gate that exists

`shouldSendNotification(supabase, userId, type, channel)` is the single decision
function:

- `channel === 'in_app'` returns `true` unconditionally. The bell is never gated.
- `channel === 'push'` returns `false` if `push_enabled` is off, else the mapped
  category flag.
- `channel === 'email'` returns `false` if `email_enabled` is off, else the mapped
  category flag.
- On any read failure, or an unmapped type, it fails open (returns `true`). This is
  deliberate: a preferences outage must not silently drop notifications.

### 1.3 The three delivery channels

1. **In-app bell**: `createNotification(...)` in
   [lib/dal/notifications.ts](../lib/dal/notifications.ts) inserts one row into
   `notifications`. It takes no channel argument and calls no preference check. It
   suppresses only the self-notification case (`actor_id === recipient_id`).
2. **Push**: a POST to `app/api/notifications/send` with a bearer `CRON_SECRET` and
   `{ userId, title, body, url }`.
3. **Email**: Resend, via `lib/email/*` and `app/api/send-*` routes.

### 1.4 What the settings screen shows

[app/settings/notifications/page.tsx](../app/settings/notifications/page.tsx) renders
the nine category toggles under the page title, then a "Delivery Method" section with
just `push_enabled` and `email_enabled`. There is no per-channel-per-category matrix:
one category toggle governs that category on both push and email.

## 2. The core problem

The settings screen presents the nine category toggles as if they control whether the
user is notified. They do not control the bell at all. Because
`shouldSendNotification(..., 'in_app')` always returns `true`, and because
`createNotification` never consults preferences anyway, a user who turns off "Social
Activity" still receives every follow, like, and comment in their bell. The toggles
today only ever influence push and email, and email is off by default.

So there are two gaps:

- **Coverage gap**: individual send sites do not all call `shouldSendNotification`
  before sending. Where a push or email is fired without the gate, the category and
  channel preferences are ignored.
- **Honesty gap**: even with perfect coverage, the category toggles would still not
  affect the in-app bell, because `in_app` is hard-coded to `true`. The UI implies
  otherwise.

## 3. Sender inventory

The enforcement work is per send site. Each row is a place that delivers on one of the
three channels. "Gated today" means a `shouldSendNotification` (or equivalent
`push_enabled` / `email_enabled` / category) check precedes the send.

Only three send sites gate today, all in crons:
`session-reminders/route.ts:137` (`session_reminder`/push),
`recurring-sessions/route.ts:207` (`series_occurrences_generated`/push), and
`behavioral-nudges/route.ts:103` (`in_app`, a no-op since in_app is always true).
Everything below is ungated unless the last column says otherwise.

### 3.1 In-app bell (`createNotification`)

The bell is never affected by preferences today (see 1.2). These sites matter for
enforcement only if question 5.1 is answered "B" (gate the bell).

| Site                                              | type                             | category        | gated               |
| ------------------------------------------------- | -------------------------------- | --------------- | ------------------- |
| `app/dashboard/instructor/page.tsx:157`           | `profile_incomplete`             | unmapped        | no                  |
| `app/requests/page.tsx:145`                       | `join_request_approved`          | unmapped        | no                  |
| `app/partners/apply/page.tsx:107`                 | `partner_application`            | unmapped        | no                  |
| `app/api/sessions/notify-join/route.ts:145`       | `session_join` / `session_leave` | session_updates | no                  |
| `app/api/invites/session/route.ts:130`            | `session_invite`                 | unmapped        | no                  |
| `lib/dal/promote.ts:72`                           | `follow`                         | social_activity | no                  |
| `lib/dal/promote.ts:556`                          | `like`                           | social_activity | no                  |
| `lib/dal/communityBulletin.ts:131`                | `bulletin_pending`               | unmapped        | no                  |
| `components/instructor/InterestButton.tsx:112`    | `training_interest`              | messages        | no                  |
| `components/session/PendingRequestsPanel.tsx:106` | `join_request_approved`          | unmapped        | no                  |
| `components/session/PendingRequestsPanel.tsx:155` | `join_request_declined`          | unmapped        | no                  |
| `app/api/cron/recurring-sessions/route.ts:195`    | `series_occurrences_generated`   | session_updates | no                  |
| `app/api/cron/waitlist-expiry/route.ts:77`        | `waitlist_offered`               | session_updates | no                  |
| `app/api/cron/waitlist-expiry/route.ts:92`        | `waitlist_expired`               | session_updates | no                  |
| `app/api/cron/spotlight-rotation/route.ts:103`    | `spotlight_selected`             | marketing       | no                  |
| `app/api/cron/behavioral-nudges/route.ts:131`     | dynamic nudge type               | training_nudges | yes (in_app, no-op) |

Note the several unmapped types above (`profile_incomplete`, `join_request_*`,
`partner_application`, `session_invite`, `bulletin_pending`). They fall through to
allowed on push/email. Part of this work is deciding their category and adding them to
`TYPE_CATEGORY`, or leaving them deliberately unmapped (always-on).

### 3.2 Push

The push route `app/api/notifications/send/route.ts` (POST single, PUT batch) does NOT
gate internally: it only checks cron auth and validates, then delivers. **Every gate
must live at the caller.** There is also one direct path that bypasses the route.

| Caller                                           | context                                    | category                  | gated       |
| ------------------------------------------------ | ------------------------------------------ | ------------------------- | ----------- |
| `app/api/sessions/notify-join/route.ts:168`      | join/leave push to host                    | session_updates           | no          |
| `app/api/sessions/notify-approval/route.ts:152`  | request approved                           | session_updates           | no          |
| `app/api/notify-nearby/route.ts:160` (batch)     | "wants to train {sport}"                   | (broadcast)               | no          |
| `app/api/instructor/notify-interest/route.ts:91` | training interest                          | messages                  | no          |
| `app/api/cron/recurring-sessions/route.ts:214`   | new sessions in series                     | session_updates           | **yes**     |
| `app/api/cron/daily-motivation/route.ts:66`      | daily motivation                           | training_nudges           | no          |
| `app/api/cron/engagement/route.ts:151`           | engagement                                 | training_nudges           | no          |
| `app/api/cron/engagement/route.ts:232`           | re-engagement                              | training_nudges           | no          |
| `app/api/cron/reminders/route.ts:131`            | host reminder                              | session_reminders         | no          |
| `app/api/cron/reminders/route.ts:156`            | participant reminder                       | session_reminders         | no          |
| `app/api/cron/reminders/route.ts:229`            | general reminder                           | session_reminders         | no          |
| `app/api/cron/session-reminders/route.ts:165`    | "session in 1 hour"                        | session_reminders         | **yes**     |
| `lib/dal/sessions.ts:532`                        | "Session Cancelled"                        | session_updates           | no          |
| `lib/payments/notifyAfterFinalize.ts:28`         | "Booking Confirmed"                        | transactional             | **exclude** |
| `lib/payments/notifyAfterFinalize.ts:53`         | "Purchase Confirmed"                       | transactional             | **exclude** |
| `lib/payments/notifyAfterFinalize.ts:67`         | "New Sale" (seller)                        | transactional             | **exclude** |
| `lib/payments/notifyAfterFinalize.ts:115`        | "You received a tip"                       | messages (`tip_received`) | decide      |
| `app/api/webhook/chat-message/route.ts:171,180`  | chat message push (direct, bypasses route) | messages                  | no          |

The payment confirmations are transactional and should be excluded from gating like the
transactional emails. The tip push (`tip_received`) maps to `messages`; decide whether a
tip is activity (gate it) or transactional (exclude it). The chat-message webhook calls
`sendFcmNotification` / `sendWebPushNotification` directly, so gating the route would not
cover it; it needs its own gate.

### 3.3 Email (Resend)

No email site gates on `email_enabled` or `shouldSendNotification` today. Split into
in-scope (activity) and out-of-scope (transactional/auth/internal/B2B).

In-scope, to be gated behind `email_enabled` + category:

| Site                                                | what                                                  | category        |
| --------------------------------------------------- | ----------------------------------------------------- | --------------- |
| `app/api/send-weekly-recap/route.ts:142`            | weekly recap                                          | weekly_recap    |
| `app/api/send-inactive-nudge/route.ts:105`          | "we miss you" nudge                                   | training_nudges |
| `app/api/send-attendance-notification/route.ts:133` | "share your session photos"                           | session_updates |
| `lib/welcome-email.ts:96`                           | welcome onboarding (borderline; likely leave ungated) | —               |

Out of scope (must NOT read `email_enabled`):

- Transactional: `app/api/send-guest-confirmation/route.ts:108` (attendance confirmation).
- Auth: email verification / password reset go through Supabase Auth
  (`app/auth/useAuthHandlers.ts:296`), not Resend, so already outside preference control.
- Internal/admin: `app/api/notify-admin-signup/route.ts:76`,
  `app/api/feedback/widget/route.ts:147`.
- Tribe.OS B2B emails (`lib/email/*`) have a SEPARATE opt-out,
  `gyms.intelligence_email_enabled`, not `notification_preferences`. They are a distinct
  track and are out of scope for this spec.

Cleanup aside (not part of this work): `Feedback button document files/route.ts` sits
outside the `app/` tree and instantiates Resend at module scope. It looks like a stray
duplicate of `app/api/feedback/widget/route.ts`. Verify and remove separately; it is not
a real sender in this inventory.

Transactional and auth emails (email verification, password reset, payment receipts)
are explicitly OUT of scope for preference gating. They are not notifications the user
may opt out of, and gating them behind `email_enabled` (which defaults to off) would
break sign-up and payments. They are listed in the inventory only so the boundary is
explicit; they must keep sending regardless of preferences.

## 4. The gating pattern

Every in-scope send site adopts the same shape. The gate goes as close to the send as
possible, and per recipient (never once for a batch).

1. Resolve the recipient `userId` and the notification `type` string (the same string
   used in `TYPE_CATEGORY`).
2. Before the actual delivery call, `await shouldSendNotification(supabase, userId,
type, channel)` for the channel being sent.
3. If it returns `false`, skip that channel's send for that recipient and continue. Do
   not throw, and do not skip the other channels: bell, push, and email are decided
   independently.
4. Keep the fail-open contract. If the check itself errors, it already returns `true`;
   do not add a second catch that turns an error into a silent drop.

Batch senders (crons that loop over many recipients) call the gate once per recipient
inside the loop, not once for the whole run. A per-recipient skip must not abort the
batch.

Recommended consolidation (optional, can follow the first gates): a single helper that,
given `(userId, type, { bell, push, email })`, runs the three checks and fires only the
allowed channels, so no future caller can forget the gate. This is a refactor, not a
prerequisite; the phased rollout below does not depend on it.

## 5. Open product questions

These two need Al's decision. They change the intended behavior, so they are called out
rather than assumed.

### 5.1 Should the category toggles gate the in-app bell?

Today the bell ignores every category toggle. Two coherent options:

- **A. Bell is an always-on inbox.** The bell is a record of everything that happened;
  categories only control push and email (the interruptive channels). If so, the
  settings screen needs copy that says the category toggles control push and email, and
  the bell keeps all activity. Least code, but the current toggle labels are misleading
  and would need rewording.
- **B. Category toggles also gate the bell.** Turning off "Social Activity" stops
  social items from entering the bell. This makes the UI honest as written, but it means
  `shouldSendNotification(..., 'in_app')` stops always returning `true`, and
  `createNotification` (or its callers) must consult it. It also means a user can make
  their own bell go quiet, which may hide things like session updates.

Recommendation to be confirmed: **A** for validation (smallest change, keeps the bell
complete), with a copy fix so the toggles read as push/email controls. Revisit B only if
users ask to mute the bell itself.

### 5.2 What is the intended email posture?

`email_enabled` defaults to `false`, so out of the box no category email is sent. Before
gating email sites, confirm:

- Which notification types are supposed to be emailable at all (most are bell plus push;
  email may be intended only for `weekly_recap` and a few high-value events).
- That the opt-in default (`email_enabled = false`) is intended, so gating email behind
  it will correctly send nothing until a user opts in. If any activity email is expected
  to reach users today, that expectation is already not met and is a separate bug.
- That every transactional/auth email is on the out-of-scope list in section 3 and does
  NOT read `email_enabled`.

## 6. Phased rollout, smallest shippable first

Each phase is independently shippable and independently testable. Order is by blast
radius and by how much of section 5 must be resolved first.

- **Phase 0 (no behavior change): confirm the inventory.** Land the table in section 3
  as the source of truth, with each row marked gated or not. No code. This is the
  contract the later phases close against.
- **Phase 1: gate push at every push send site.** Push already has a sensible default
  (`push_enabled = true`, categories mostly true), so gating it changes behavior only
  for users who have opted out, which is exactly correct. No open question blocks this.
  Smallest correct behavior win. Ship it first, one send site per commit if useful.
- **Phase 2: gate the batch crons.** The reminder, nudge, and recap crons loop over many
  users; add the per-recipient gate inside each loop. Higher volume, so ship after the
  push pattern is proven in Phase 1. Verify a per-recipient skip never aborts the batch.
- **Phase 3: resolve 5.2, then gate email.** Because email defaults off, gating it is
  safe (it sends less, never more), but it is pointless until 5.2 confirms which emails
  are meant to be preference-controlled and which are transactional. Do the transactional
  exclusion list first, then gate the remaining activity emails.
- **Phase 4: resolve 5.1, then make the bell honest.** If Al picks option A, this is a
  copy change to the settings screen only. If option B, this is the largest change:
  route `createNotification` (or its callers) through `shouldSendNotification` and stop
  hard-coding `in_app` to `true`. Ship last because it is the most user-visible and the
  most likely to need iteration.

Each phase's test: set the relevant preference off, trigger the notification, and
confirm the specific channel is suppressed while the others still fire. Then set it on
and confirm delivery. Fail-open is tested by simulating a preferences read error and
confirming the notification still sends.
