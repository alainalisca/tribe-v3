# BUG-222 Report — Localize notification copy to recipient's language

## Language column status

`preferred_language VARCHAR(2) DEFAULT 'en'` already exists on `public.users`. It was added by `supabase/migrations/add_last_motivation_sent.sql` and is already present in `lib/database.types.ts` (rows 1454, 1521, 1588) and in `lib/dal/types.ts`. **No new migration was required.**

## Where the preference is now persisted

`lib/LanguageContext.tsx` — the `setLanguage` setter now also calls `updateUser(supabase, user.id, { preferred_language: lang })` via the DAL client (`@/lib/supabase/client`) whenever the authenticated user changes their language. The call is fire-and-forget (a DB hiccup must not block the UI switch); localStorage remains the source of truth for the client-side context.

## Shared template helper

`lib/notification-i18n.ts` — new file providing:
- `notificationCopy(key, lang, vars)` → `{ title, body }` (bilingual, interpolates `{{var}}` placeholders)
- `toLang(raw)` — normalises any string/null to `'en' | 'es'`, defaulting to `'en'`
- Templates: `join`, `join_request`, `join_guest`, `waitlist_offered`, `waitlist_expired`, `spotlight_selected`, `smart_match`

## Notification templates localized

| File | What was done |
|---|---|
| `app/api/sessions/notify-join/route.ts` | Fetches host's `preferred_language` via service client; uses `notificationCopy('join'\|'join_request'\|'join_guest', hostLang, {name, sport})` |
| `app/api/cron/waitlist-expiry/route.ts` | Batch-fetches `preferred_language` for affected users; uses `notificationCopy('waitlist_offered'\|'waitlist_expired', lang)` for `createNotification` messages |
| `app/api/cron/spotlight-rotation/route.ts` | Fetches selected instructor's `preferred_language`; uses `notificationCopy('spotlight_selected', lang)` |
| `app/api/cron/smart-match/route.ts` | Adds `preferred_language` to the users fetch; uses `notificationCopy('smart_match', recipientLang, {name, sport})` |
| `app/api/cron/behavioral-nudges/route.ts` | Adds `preferred_language` to the active-users fetch; selects `best.messageEs` when `userLang === 'es'`, `best.message` otherwise (behavioral-engine already ships both strings) |

## Templates already localized before this PR (no change needed)

| File | Notes |
|---|---|
| `app/api/cron/reminders/route.ts` | Already used `hostLang` / `pLang` with inline ternaries |
| `app/api/cron/session-reminders/route.ts` | Already used `reminderMessages[lang]` pattern |
| `app/api/cron/daily-motivation/route.ts` | Already used `getMessageContent(message, language)` |
| `app/api/cron/engagement/route.ts` | Already used `preferred_language` for weekly recap and re-engagement |

## Templates NOT localized (out of scope / low risk)

| File | Reason |
|---|---|
| `app/api/cron/behavioral-nudges` — `nudge_log.message` stored EN for history | Log column; doesn't surface to users directly — now stores the localised string |
| `lib/payments/notifyAfterFinalize.ts` | Email-only path; covered by a separate email i18n layer |
| `app/api/cron/post-session-followups/route.ts` | Calls `send-attendance-notification` (separate internal route); email-driven, not push; out of scope for this ticket |
| `app/api/cron/weekly/route.ts` | Delegates to `send-weekly-recap` / `send-inactive-nudge` internal routes — separate email layer |

## TypeScript result

`npx tsc --noEmit` — **no errors** (clean output).

## Tests

- New: `lib/notification-i18n.test.ts` — 22 tests covering every template key in both languages + `toLang` fallback behaviour. All pass.
- Updated: `app/api/sessions/notify-join/route.test.ts` — mock extended to handle the new `users` table query; added ES-language assertion. Now 7 tests, all pass.
- Full suite: 687 tests across 58 files — all green.

## Files changed

- `lib/notification-i18n.ts` (new)
- `lib/notification-i18n.test.ts` (new)
- `lib/LanguageContext.tsx` (persist preference on change)
- `app/api/sessions/notify-join/route.ts` (fetch host lang + bilingual templates)
- `app/api/sessions/notify-join/route.test.ts` (update mocks + add ES test)
- `app/api/cron/waitlist-expiry/route.ts` (bilingual waitlist messages)
- `app/api/cron/spotlight-rotation/route.ts` (bilingual spotlight message)
- `app/api/cron/smart-match/route.ts` (bilingual smart match message)
- `app/api/cron/behavioral-nudges/route.ts` (pick messageEs for es users)

## Migration note

**The migration is NOT required for this PR** — `preferred_language` already exists on `public.users`. No SQL needs to be run.
If for any reason the column is missing in a given environment, run:
```sql
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(2) DEFAULT 'en';
```
(This is idempotent and safe to run at any time.)
