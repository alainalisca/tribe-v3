# T-LANG1: `users.preferred_language` cannot distinguish a choice from a default

**Filed** 2026-09-22. **Priority** medium. **Not started.**
**Found by** the one-off sports nudge, which was about to email 34 people in
English because the column said so.

## The defect in one sentence

The app's no-signal language default is **Spanish**; the column's default is
**English**; and a stored `'en'` cannot be told apart from never having been
asked. So a user who has never touched the toggle sees a Spanish UI and
receives English email.

## The column

`add_last_motivation_sent.sql`: `preferred_language VARCHAR(2) DEFAULT 'en'`.

Measured on production, 2026-09-22:

| population                     | `en` | `es` |
| ------------------------------ | ---- | ---- |
| all live users (99)            | 94   | 5    |
| the sports-nudge audience (34) | 34   | 0    |

95% `en` in a Medellín-first product is not a preference signal. It is a column
default that almost nobody has overwritten.

## How the app actually decides, today

`lib/LanguageContext.tsx`, in priority order:

1. **`localStorage.language`** — an explicit choice on this device. Outranks
   everything, including the stored server preference, "because it is the most
   recent thing the user actually said".
2. **`users.preferred_language`** — consulted **only** when the device has no
   cached choice, and a read failure returns `null` rather than throwing, which
   leaves the browser answer standing.
3. **Browser locale** — `es*` → es, `en*` → en.
4. **Spanish** — the no-signal fallback, in the file's own words because
   "Tribe is a Medellín-first product".

**Does the app trust the column?** Only conditionally. It sits at priority 2 of
4, below a device-local value, and it is discarded on any error.

**Is it ever a real signal?** Yes, sometimes, and that is the trap. It is
written at `LanguageContext.tsx:165`, inside `setLanguage`, so a value written
_that_ way is a genuine choice. But the DB default writes the identical string
at row creation for every user. **Both produce `'en'`. Nothing records which
one happened.** Same shape as `email_enabled` (037 default false, 151 backfill),
`onboarding_completed_at` (156 backfill) and `athlete_setup_completed_at` (new
column, NULL for everyone) — the fourth instance in one week.

## Work

1. **Make "never asked" representable.** Either `DROP DEFAULT` so an untouched
   row is `NULL`, or add `preferred_language_set_at timestamptz` written only
   by `setLanguage`. The second is additive and reversible; the first is
   truthful but touches a column many jobs read.
2. **Do not backfill a guess.** Leaving 94 rows ambiguous is honest; rewriting
   them to `es` would repeat the mistake in the other direction.
3. **Align the defaults.** If the app's no-signal answer is Spanish, the
   column's default should not be English. Pick one and let both sides read it.
4. **Audit the readers.** `send-weekly-recap`, `send-inactive-nudge`,
   `send-attendance-notification` and the cron notification paths all branch on
   this column and will all have been sending English to people the app shows
   Spanish.

## Done meanwhile, not a fix

The sports nudge no longer reads the column at all: it sends **both languages,
Spanish first**, on email and push. That removes the guess for one campaign. It
does not fix the column, and the other senders above still branch on it.

## Related

- Spanish copy approval for the nudge: **T-ES-REVIEW-2** (Notion), with Ana.
- `docs/TICKET-gym-digest-unsubscribe.md` (T-EMAIL1).
