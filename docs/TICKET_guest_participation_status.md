# Ticket: guest_participation_status should match on the guest's token, not phone or email

Found 2026-09-27 by the T-AV19 sibling sweep. Not urgent enough for a hand
fix: the function only reads, and it returns no contact details. Normal
process: branch, migration, merge, then paste.

## The problem

`public.guest_participation_status(p_session_id uuid, p_guest_phone text, p_guest_email text)`
is `SECURITY DEFINER` and executable by `anon` (the guest flow needs that,
because a guest is not signed in). Given a session id and a phone number or
email, it returns `{ has_joined, participant_id }` for a guest row on that
session.

So anyone who knows a person's phone number or email, and a session id
(session ids appear in public session URLs), can confirm whether that person
signed up for that session as a guest. It is a presence oracle over personal
contact details, and it also hands back the participant id.

## Callers

| where                                                                   | what it does                                                                                                                                                                                        |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hooks/sessionActionHelpers.ts`, `checkGuestStatus()` (around line 140) | Reads `guest_phone_<sessionId>` and `guest_email_<sessionId>` from localStorage and calls the RPC. On `has_joined`, returns `{ hasJoined, participantId }`; otherwise clears the three stored keys. |
| `hooks/useSessionActions.ts:347`                                        | Calls `checkGuestStatus` on the session page to decide whether to show "joined" and to keep `guestParticipantId`.                                                                                   |

No server route and no other RPC calls it.

## What already exists

- `session_participants.guest_token uuid DEFAULT gen_random_uuid()`, so every
  guest row has a token.
- `join_session_as_guest` returns `guest_token`, and `storeGuestLocally()`
  (`hooks/sessionActionHelpers.ts`, around line 42) saves it as
  `guest_token_<sessionId>` next to the phone and email.
- `guest_leave_session(p_session_id, p_guest_token)` already authenticates the
  guest by that token (RLS-H3 Gate 2). This ticket makes the status check use
  the same credential as the leave action.

## The change

1. **Migration (new number, re-read `origin/main` when writing):** replace the
   function with
   `guest_participation_status(p_session_id uuid, p_guest_token uuid) returns jsonb`,
   matching `session_id = p_session_id AND is_guest AND guest_token = p_guest_token`.
   A NULL token returns `{ has_joined: false }` without querying. Drop the
   phone/email overload in the same migration, so the oracle is gone rather
   than left beside the new function. Grants: `anon`, `authenticated`,
   `service_role`; `REVOKE ALL ... FROM public` first.
   `RISK: HIGH` (replaces a function the live guest flow calls).
2. **Deploy order:** the new signature and the old one cannot both be what the
   client calls. Either ship the client first, calling the new signature with
   a fallback to the old one on `PGRST202` (function not found), then the
   migration, then remove the fallback. Or ship both in one deploy, with the
   migration pasted immediately after the merge. The first is safer for a
   guest page that is live.
3. **Client:** `checkGuestStatus` reads `guest_token_<sessionId>` and sends
   only that. It stops reading phone and email for this call. It keeps
   clearing all three keys when the answer is "not joined".
4. **Response:** keep `participant_id` only if the session page still needs
   `guestParticipantId` (check `useSessionActions.ts` usage when doing this).
   If not, return `has_joined` alone.

## What breaks

- **Guests whose browser has phone or email stored but no token.** Guests who
  joined before the client started storing `guest_token` fall into this group.
  After the change their status check returns "not joined", the page offers
  Join again, and localStorage is cleared. **Nothing stops a second join:**
  guest rows have `user_id` NULL, and the only unique indexes on
  `session_participants` are on `(session_id, user_id)`, where NULLs never
  collide. So such a guest can take a second spot. How many such browsers
  exist cannot be measured: localStorage is on the guest's device.
  Mitigation options, pick one when doing this: accept it (rare, old joins),
  or keep a server-side dedupe in `join_session_as_guest` on
  `(session_id, lower(guest_email))` / normalized phone for guest rows.
- **Guests on a second device.** They could not be recognised by token, but
  they could not be before either unless they re-typed the same details
  (the page reads localStorage, not a form). No change.
- **Anything that relied on phone/email lookup.** Nothing found besides the
  hook above; re-grep for `guest_participation_status` before merging.

## Test plan

1. **Unit, client:** `checkGuestStatus` sends only `p_session_id` and
   `p_guest_token`; with no stored token it does not call the RPC and returns
   not-joined; on not-joined it clears all three keys. Mutation: send phone
   again and the "sends only the token" test goes red.
2. **Rehearsal, local stack, rolled back, as `anon`:**
   - right token for the session: `has_joined` true (the control; without it
     every "false" below is vacuous);
   - wrong token, a token from another session, NULL token: false;
   - the old phone/email signature: does not exist (`42883`), so the oracle is
     gone rather than bypassed;
   - `guest_leave_session` with the same token still works (unchanged).
3. **Probe** in `verify-migration-state.sql`: the token signature exists,
   `anon` can execute it, and the phone/email signature does not exist.
4. **Browser, local stack:** join as a guest, reload, still shown as joined;
   leave, reload, shown as not joined; clear only `guest_token_<id>` in
   devtools, reload, shown as not joined and storage cleared.
5. **Full suite** (`npm run test:complete`), files-run equal to files-on-disk.
