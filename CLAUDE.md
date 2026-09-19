# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tribe is a mobile-first PWA for connecting athletes to train together. Users can create/join training sessions, chat with participants, and find workout partners nearby. The app supports English and Spanish localization and targets the Colombia/Medellín market.

## Code Quality Standards

Before writing ANY code, consult these two files:

- `engineering-standards.md` — Senior-engineer-level SOPs for all code quality decisions
- `CONVENTIONS.md` — Project-specific UI and spacing conventions

All new code MUST:

- Use typed props and return types (no `any` without a comment explaining why)
- Use the data access layer pattern (lib/dal/) for database operations — no inline Supabase calls in components
- Include proper error handling (never empty catch blocks, use lib/logger.ts when available)
- Follow the fixed header spacing conventions in CONVENTIONS.md
- Be under 300 lines per file (split into focused components/modules if larger)

### Working agreements

**Commit before you experiment. `git stash -u` followed by `git checkout -- .` on a dirty tree is unrecoverable.**

A revert test needed a clean tree, so the working tree was stashed, modified, popped, and then reset with `git checkout -- .` — which discarded the popped changes. About an hour of uncommitted work went with it, and it survived only because an unrelated `/tmp` copy happened to exist. The stash was gone: `pop` had already consumed it.

Any experiment that needs a clean tree needs a **commit** first, not a stash. A commit is recoverable from the reflog even after a hard reset; a popped stash that is then discarded is not recoverable by anything. This is the same reason each approved gate gets its own commit rather than accumulating in the working tree — uncommitted work has no history to fall back to, and the moment you most want to throw away local changes is the moment you are least able to tell which ones are yours.

## Skills

Project-specific skills live in `.claude/skills/`. Before writing code in a domain (API routes, components, migrations, tests, i18n, etc.), read the relevant `SKILL.md` file for enforced patterns and checklists. Run `/session-briefing` at the start of a new session to get oriented.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run lint     # Run ESLint
npm start        # Start production server
```

## Tech Stack

- **Framework**: Next.js 16 with App Router (server-rendered, deployed to Vercel with Node.js runtime)
- **Database/Auth**: Supabase (PostgreSQL with RLS policies)
- **Styling**: Tailwind CSS with custom brand colors
- **Mobile**: Capacitor for iOS/Android builds
- **Analytics**: PostHog
- **Notifications**: Web Push via Supabase Edge Functions
- **Email**: Resend
- **Maps**: Leaflet/React-Leaflet

## Architecture

### Directory Structure

- `app/` - Next.js App Router pages (all client components with `'use client'`)
- `components/` - Reusable React components
- `lib/` - Utilities, Supabase clients, translations
- `contexts/` - React Context providers (Theme, Language)
- `supabase/` - Database schema, migrations, Edge Functions
- `messages/` - i18n JSON files (en.json, es.json)

### Key Patterns

**Supabase Client Usage**

- Client-side: `import { createClient } from '@/lib/supabase/client'`
- Server-side: `import { createClient } from '@/lib/supabase/server'`

**Translations**

- Use `useLanguage()` hook from `@/lib/LanguageContext`
- Access translations via `t('key')` or `language` for conditional text
- Sport names use `sportTranslations` from `lib/translations.ts`

**Theming**

- Use `useTheme()` hook from `@/contexts/ThemeContext`
- Brand colors defined in `tailwind.config.ts`: `tribe-green`, `tribe-dark`, `tribe-gray-*`, `tribe-red`
- Dark mode uses class-based switching

**No green in the palette reaches AA as small text on a light surface. Green is a fill, a border, an icon or a large heading — never body copy on light.**

Measured 2026-09-13 on the deployed page, not derived from the palette file:

| token                        | on white   | on `bg-theme-inset` `#F0F1F3` | on a `tribe-green/20` chip `#EEF8D7` | on `#272D34` |
| ---------------------------- | ---------- | ----------------------------- | ------------------------------------ | ------------ |
| `tribe-green` `#A8DA36`      | 1.65:1     | 1.46:1                        | 1.49:1                               | 8.43:1       |
| `tribe-green-100` `#C0E863`  | 1.40:1     | 1.24:1                        | 1.27:1                               | 9.90:1       |
| `tribe-green-dark` `#6FA300` | **3.04:1** | 2.69:1                        | 2.75:1                               | 4.58:1       |

`tribe-green-dark` is the best available and still fails: 3.04:1 clears the 3:1 bar for large text (≥24px, or ≥18.66px bold) and for non-text UI like borders and icons, and fails the 4.5:1 bar for body copy. There is no value to reach for — do not go looking.

For a green-branded label on a light surface, keep the green as the **background** and use `text-tribe-dark` (`#272D34`, the palette's own "primary text on light"): 12.6:1 on the chip, 12.3:1 on the inset row.

Green-on-dark is fine and always was — `tribe-green` is 8.43:1 on `#272D34`. That is exactly why this stays hidden until a surface stops being dark, which is how the share pages shipped a 1.46:1 sport label.

**Toast Notifications**

- Use helpers from `@/lib/toast`: `showSuccess()`, `showError()`, `showInfo()`

**In-app chrome does not belong on a public share route.** `/g/[slug]`, `/i/[id]` and `/invite/` are where a stranger forms their first impression, so the app-install modal and the FeedbackWidget are both suppressed there. One list — `lib/publicShareRoutes.ts` — consumed by both components; register a new public route there rather than adding a second route check. It is deliberately NOT middleware's `publicPaths`, which answers a different question ("does this need a session") and is a superset.

**Never exercise venue, partner or approval flows against a real gym's live record.** Use a dedicated test partner row. The cost is not hypothetical: T-GYM2's venue-approval testing was run against CrossFit BullBox's production `featured_partners` record, and six invented classes — including a 9:10 PM swimming session at a CrossFit box — ended up on the gym's own public page at `/g/bullbox/`, under their name, waiting for the owner to open his own bio link. One of them was booked by a real athlete for a class that was never going to happen.

Two properties make this worse than ordinary test residue: `sessions.partner_status` is written only by `review_venue_request`, so approvals made while testing are indistinguishable from real ones afterwards; and nothing in the venue-review path notifies anyone, so neither the gym nor a booked participant is told when a session's venue changes. Create the test partner, test against it, and leave live partner rows alone.

**A detector that searches for a NAME answers "is this spelled the way I expected", not "does this do the thing".** Assert on the capability or the observable outcome, never on an identifier.

Caught four times in 48 hours on 2026-09-13/14, each time producing a confident wrong answer that survived until something unrelated contradicted it:

| the check that was written                                                  | what it actually answered                                        | what it missed                                                                                                                                                                               |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "is `IOSInstallPrompt` present on the page?"                                | whether that component was mounted                               | a CTA whose destination auto-navigated to the App Store. Both suppression checks passed while the page still ejected a visitor in one tap.                                                   |
| `.select()` scanned with a single-line window                               | whether a column list happened to fit on one line                | `fetchUserProfile`'s multi-line list, producing an 18-column "dead" list. Revoking it would have failed the profile page's main read with `42501`, invisible to every test.                  |
| `grep getServiceRoleClient`                                                 | whether a file spells the helper that way                        | two routes that build a service client inline with `createClient as createServiceClient`. Would have widened the `users` UPDATE allowlist by five Tribe.OS columns for every logged-in user. |
| migration 165's guard counting the bare string `auth.uid() IS NOT NULL AND` | how many times that phrase appears anywhere in the function body | that a COMMENT inside the body quoted the phrase while explaining the fix. Counted 4 where 3 were expected and failed the migration — a guard matching its own author's prose.               |

The rewrites that worked, in the same order: look for _any_ element that intercepts a tap at the heading's centre and follow _every_ link to where it lands; parse the call rather than a line; ask whether the file constructs a client with `SUPABASE_SERVICE_ROLE_KEY` by any spelling; anchor on the whole `IF` statement rather than on a phrase prose can contain.

Same family as the privilege rule below: `has_table_privilege` answers "can this role do it", `information_schema.table_privileges` answers "is there a row that says so". Prefer the capability question every time.

**A SECOND WAY THE SAME PASS GOES WRONG: the check asked the right question, but the scenario was never reproduced.**

A check can pass because the situation it guards against never occurred, not because the detector was mis-aimed. The question was fine; the setup did not put the system into the state being tested.

T-GYM4 step 6 — "submit again from a second tab, expect a written sentence rather than a unique-violation message". The first attempt opened the second tab **after** the first submit had created the row. A tab loaded at that point takes the "you already have an application" guard path and never reaches submit at all. The assertion passed. **The unique violation the check existed to catch was never raised.** The real scenario needed a tab loaded _before_ the row existed — a second account, both tabs on the form, then submit in both — which produced the violation and the mapped sentence.

A second worked example, from the cleanup of those same test rows. The statement used data-modifying CTEs and verified the result in its own main `SELECT`:

```sql
WITH deleted AS (
  DELETE FROM featured_partners WHERE slug IN (...) RETURNING slug
)
SELECT (SELECT count(*) FROM featured_partners WHERE slug IN (...)) AS still_there,
       (SELECT count(*) FROM deleted) AS removed;   -- disagreed with each other
```

`RETURNING` reported the rows removed while the verification subquery reported them still present. Both were right: in PostgreSQL every CTE and the main query run against **one snapshot taken before the statement began**, and data-modifying CTEs cannot see one another's effects. **A verification that runs inside the same statement as the mutation cannot observe that mutation** — it is structurally incapable of it, however the query is written. Verify in a separate statement, after the first has committed.

**The tell is specific and easy to look for: a test written to catch an error passed without that error ever occurring.** When a check is for a failure path, confirm the failure actually fired before recording a pass — assert on the error having happened, not only on the handling being correct. The same shape applies to a guard in a migration: 165's `pg_trigger_depth` and counter-revert guards were each proved by deliberately reintroducing the mistake and watching them raise, rather than by observing them stay quiet.

**A THIRD WAY, and the hardest to see: the check asserted the OUTCOME of a failure rather than the RECOGNITION of it.**

Correct handling and total absence of handling frequently produce the same visible result. When they do, an assertion on the result cannot tell them apart, and it will pass against code that has no error handling at all.

Found on 2026-09-17 in `useVisibilityTier`. The test asserted that a failed tier query falls back to tier 1. Deleting the `if (!result.success)` branch entirely makes the code read `result.data!.past` on `undefined`, throw, and land in the outer `catch` — **which also yields tier 1.** Identical outcome, completely different behaviour, test still green. The same mutation against `ProfileUpcomingSessions` rendered nothing either way, because an empty list and a null list both render nothing.

The fix in both cases was to assert the thing that actually differs: **that the failure was recognised** — `logError` called, carrying the original reason — not that the aftermath looked tidy. Mutation testing is what exposed it; neither test looked weak by inspection.

**FOUR DISTINCT FLAVOURS OF VACUOUS CHECK WERE FOUND IN ONE DAY.** They share nothing in their shape, so there is no single pattern to grep for — only the habit of breaking the production path and watching the check fail:

| what happened                                                                                                | why it passed anyway                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| A rehearsal recorded its finding with an `INSERT` inside the subtransaction it then deliberately rolled back | The probe row vanished with the thing it described; the check read `NULL`, which renders as a FAIL and says nothing either way                |
| `SessionCard.test.tsx` set `session_participants` on its fixture                                             | `computeSessionStatus` reads `session.participants`; the setup was dead and the assertion passed on an unrelated `current_participants` value |
| A test asserted an avatar stack was absent                                                                   | `AvatarStack` was mocked to `() => null`, so the element could never have existed and the assertion could never have failed                   |
| A test asserted tier 1 after a failed query                                                                  | Deleting the error branch crashes into an outer `catch` that also produces tier 1                                                             |

**The habit that catches all four: after a check passes, break the code it guards and confirm it fails, naming the test.** Every one of these survived review by a careful reader and died to a one-line mutation.

**A MUTATION PROOF EXPIRES. Re-run it against current code before trusting an old branch.** A test's strength is a property of the test _and_ the code around it, and only one of those is frozen when a branch is parked.

`fix/language-honors-stored-preference` was written on 2026-09-04 with twelve tests and a mutation proof, and sat unmerged for two weeks while main moved 68 commits. It rebased cleanly and all twelve still passed. Re-running the proof found **two mutations that no longer failed anything**:

- `.select('preferred_language')` → `.select('id')` broke nothing, because the Supabase mock answered any query with its fixed row. The column name was never pinned — and `public.users` is under column-level grants, so a wrong column name is a `42501` that takes the whole provider down, not a missing field.
- _"does not query at all for a signed out visitor"_ asserted only that `maybeSingle` was never called. Deleting the `if (!data.user) return null` guard makes the code call `.from()` and `.select()` and then throw on `undefined.id` — so `maybeSingle` is still never reached and the assertion still passed. It now asserts on `.from()`, the earliest observable point.

Both were the outcome-versus-recognition flavour above, in code that had already passed review once. **That makes five instances of this taxonomy found in two days, every one in code a careful reader had already approved.**

So when picking up a branch older than a few days: rebase, run the suite, and then **re-run the mutation proof from its own commit message**. Passing tests prove the tests pass. They do not prove the tests still bite.

**It is not only tests. The same class shows up in any instrument that watches something.** A deploy monitor built the same day ran `vercel ls --yes --prod 2>/dev/null` and polled the result for `Ready` or `Building`. It never saw either: **`vercel ls` writes the status table to stderr and only bare URLs to stdout**, so `2>/dev/null` discarded the exact column being read. The monitor could not observe the thing it existed to observe — structurally, the same failure as the rehearsal probe that vanished inside its own rollback.

The first version had no guard and looped silently for fifteen minutes, which is indistinguishable from "still building". The second reported `state unreadable` and stopped, and **that loud failure is what located the cause.** So: when a watcher reads a field, make "the field could not be read" a distinct, noisy outcome — never a value that happens to look like waiting. A silent watcher and a working one look identical for exactly as long as it takes to matter.

**The sharpest version of "reading a wider set than you believe": a `WHERE` clause that does not constrain what you think, because `AND` does not short-circuit.** Migration 168's rehearsal counted anon-readable columns with

```sql
SELECT count(*) FROM information_schema.columns c
 WHERE c.table_schema = 'public' AND c.table_name = 'users'
   AND has_column_privilege('anon', 'public.users', c.column_name, 'SELECT')
```

and it failed with `42703: column "instance_id" of relation "users" does not exist`. `instance_id` belongs to `auth.users`. **The schema filter was correct and was not the problem** — the planner is free to evaluate the `has_column_privilege` predicate _before_ the two filters, since it is `STABLE` and cheap, and it then receives a column name from `auth.users`. This is migration 159's finding wearing different clothes: Postgres evaluates the whole expression, and `OR` does not short-circuit either.

**A tighter filter would not have fixed it, because the bug is evaluation order, not matching.** Make the wrong rows unreachable instead: `'public.users'::regclass` resolves to exactly one table, so every row is by construction a column of it whatever order the planner picks. Add `attnum > 0` (system columns) and `NOT attisdropped` (DROP COLUMN tombstones, whose `attname` is mangled and raises the same way), and materialise the set before the function sees it.

**When a check iterates a catalog, prefer `pg_attribute` keyed on `regclass` over `information_schema` filtered by name.** `users`, `sessions` and `notifications` all exist in more than one schema here, and `information_schema` will happily hand you all of them.

**A SIXTH, AND IT IS NOT A CHECK THAT CANNOT FAIL.** The five above are checks aimed at the wrong thing or unable to report. This one is aimed correctly and is **structurally blind to the exact shape it was written for.**

The T-AUD3 guard exists to catch a dotted translation key that cannot resolve. It skipped any key containing `${`, because a template key cannot be resolved statically. **The T-AUD3 defect _is_ a template literal** — ``t(`fields.${field}`)`` — so the guard could not catch the bug it was written for, and passed when that bug was reverted. The fix was to flag a dotted STATIC PREFIX, which can never resolve under a flat lookup whatever the substitution is.

**So: when writing a guard for a specific bug, the first mutation is always reverting that bug.** Not a similar one, not a simpler one — that one. If the guard survives, it does not guard what its name says.

**A DEFECT REPORTED FROM A SCREENSHOT GETS FIXED AT THE FIRST MATCHING STRING, NOT AT EVERY SOURCE OF IT — and the report then reads as resolved.**

`Anos de Experiencia` (missing the tilde on `Años`, which in Spanish is not a near-miss) was reported on 2026-09-14 from the Descubre Instructores screenshots. It was still rendering three days later, because **the same text lived in two independent places**: `components/InstructorCard.tsx` and `messages/es.json`. Whoever looked found one, fixed it, and closed the report. Half the defect shipped on, and the ticket said done.

**Before closing anything reported from a screenshot, ask how many places produce that text.** Grep the rendered string, not the file you happen to be looking at. In this codebase the same copy can live in `messages/es.json`, a bilingual table, an inline `language === 'es'` ternary, and an `if (language === 'es')` block — four systems, any of which can render the screen you were sent.

**AND THE SAME FAMILY AGAIN: the instrument read a narrower set than it believed.** The first accent sweep reported **109** strings. The real surface was **157**, because the sweep had three scan patterns and the codebase has five Spanish-bearing shapes — it never saw `export const baseEs = {...}`, `if (language === 'es')` blocks, or lines too long for a `^key: '...'$` match.

That is the same failure as `vercel ls` writing its status to stderr while the monitor read stdout, and as the 168 rehearsal counting `auth.users` columns it believed it had filtered out. **Three instances in two days of a tool confidently reporting a number that was a property of the tool, not of the thing measured.** When a sweep returns a count, ask what shapes it cannot see before quoting it.

**A FOURTH, and it is the one most likely to recur: an attribute-matching regex over JSX is blind to any handler containing an arrow function.**

Counting form controls below 16px, the scan used `<(input|textarea|select)\b((?:[^<>]|\n)*?)/?>` and reported **2**. The real number was **89**. The `[^<>]` character class terminates on the `>` in `=>`, so every control with an inline handler — `onChange={(e) => setForm(...)}`, which in this codebase is most of them — had its attributes truncated before `className` was reached.

**`[^<>]` cannot be used to span JSX attributes.** Walk forward from the tag name tracking brace depth, and treat `>` as a tag close only at depth 0:

```js
let i = tagNameEnd,
  depth = 0;
while (i < src.length) {
  const c = src[i];
  if (c === '{') depth++;
  else if (c === '}') depth--;
  else if (c === '>' && depth === 0) break;
  i++;
}
```

**This was caught by the CLAUDE.md entry written an hour earlier** — the "ask what shapes it cannot see before quoting the count" rule, applied to the very next count. That is the entry working as intended, and it is the argument for writing these down the same day rather than at the end of the week.

**SAME FAMILY, DIFFERENT MECHANISM: an array column can be NULL _or_ `{}`, and `col = '{}'` silently returns NULL rather than false.** So a guard written the obvious way aborts on a correct database.

Writing migration 171's guard, the three backfill targets looked identical from the application: `users.sports` read as an empty list on all of them. In the database two were `{}` and one was **NULL**. `sports = '{}'` against a NULL column evaluates to NULL, not false, so `count(*) WHERE sports = '{}'` would have counted **2**, the guard would have compared 2 to its expected 3, and the migration would have refused to run on data that was exactly as measured.

**Use `coalesce(array_length(col, 1), 0) = 0` for "this array is empty or absent",** and reach for `IS DISTINCT FROM` rather than `<>` whenever either side can be NULL.

The connection to the instrument findings is not the SQL, it is the shape: the instrument reported a number that was a property of how it asked, not of the data. The three-valued logic is just a quieter version of `2>/dev/null` eating the column being read — there is no error, no empty result, only a count that is wrong in the safe-looking direction. **A guard that aborts on correct data is as broken as one that passes on wrong data, and it is harder to notice, because an abort reads as the guard doing its job.** Prove both arms fire (171's rehearsal, Parts B and C) rather than trusting a clean run.

**A PATCH whose payload is built from component state will blank any column that state does not know about.**

Adding a sports chip row to the instructor storefront editor was nearly a data-loss bug dressed as a feature. `updateStorefrontProfile` PATCHes `public.users`, and the editor builds its payload from four pieces of local state. The new `sports` key initialised to `[]` instead of from the prop would have sent `sports: []` on **every save**, wiping a column the instructor had set on a different screen -- and it would have fired on an unrelated action, saving a bio, with no error and a "Saved!" toast. Caught only by a mutation (`useState<string[]>([])` instead of `useState<string[]>(initialSports)`), which failed one test.

**The rule: when adding a field to a form that PATCHes, read what else that PATCH writes, and ask whether the new field's EMPTY state can overwrite something the form never loaded.** A partial update is only safe for the columns the form actually owns. The fix is either to prefill from the row (what the storefront editor does) or to omit the key when the form has nothing to say about it -- the pattern INS-01 already uses for `location`, which is omitted rather than written blank precisely so re-running the wizard cannot clear a value set from `/profile/edit`.

**A guard's exemption list is itself something that goes stale, and a stale exemption silently re-permits exactly what the guard exists to catch.**

`lib/sports.singleSource.test.ts` fails if any module declares its own sport list, and two production files legitimately still do (`PartnerApplyForm`'s partner-application vocabulary, `venues/nearby`'s derived suggestions). They sit in `KNOWN_RIVAL_LISTS` with a reason each. The second test asserts that **every entry still offends**: fix `PartnerApplyForm` and the guard fails with "Remove these from KNOWN_RIVAL_LISTS -- they are fixed". Without it, the day someone aligns that file its exemption becomes a permanent hole, and the next rival list added to it passes unnoticed.

**Assert the exemption, not just the rule. It belongs anywhere an allow-list is introduced.** Two shapes, and both were used deliberately:

- An allow-list **with** a rot test, where the exempted cases are real and enumerable (this guard; `DELIBERATELY_EXCLUDED` in `lib/i18n/spanishAccents.ts`, which carries the RAE-2010 citation for `este`/`solo`).
- **No allow-list at all**, where exemptions would accumulate faster than anyone audits them. The unresolved-key warning in `useTranslations`' `pick` fallback was shipped with none for exactly this reason: an allowlist there would have filled up with keys nobody re-checked, and the guard's whole value is that it fires on a key shape rather than on a list of known-bad keys. The two decisions are the same judgement, not a contradiction -- take the allow-list only when you can commit to proving each entry still earns its place.

**AN EXEMPTION WITHOUT A REASON IS A SUPPRESSION NOBODY CAN AUDIT — AND IT IS ROT'S WORSE SIBLING.**

The rot test asks whether an entry **still** earns its place. It cannot ask whether an entry **ever** earned it.

`'unete'` sat in `LEAVE_UNACCENTED` with no comment, between two entries that each carry a full paragraph of justification. `únete` is an imperative and always takes the accent, so the exemption is simply wrong — and it silenced the guard over **13 occurrences across three files**. A rot test would have passed it forever, because the word does keep appearing: the entry kept "earning its place" by continuing to suppress a real defect.

**The tell was visible without knowing any Spanish.** Every neighbouring entry explains itself. That one did not. An entry added to make a guard green looks exactly like this — no reason, because there was no reason, only a red suite and a deadline.

**Every exemption carries its reason inline, and an entry with no reason is a defect regardless of whether it happens to be correct.** The reason is not documentation of the decision; it _is_ the decision, and it is the only thing a later reader can check. An unexplained entry cannot be audited, cannot be distinguished from a mistake, and cannot be removed by anyone who is not willing to re-derive it from scratch — so in practice it never is.

When reviewing an allow-list, read it for **missing comments first**, before reading the entries. The gap is the finding.

**WHEN A GUARD KEEPS FLAGGING AFTER YOU BELIEVE YOU HAVE FIXED IT, YOUR SEARCH WAS NARROWER THAN THE GUARD'S.**

Chasing `unete`, the count went **3, then 7, then 13** across three passes. Each time the fix looked complete, the guard still flagged, and it read as the guard being stubborn. It was not: `grep unete` missed capitalised `Unete`, and a directory-scoped grep missed `hooks/` and the other translation tables. The guard was lowercasing every word and walking the whole repo — a wider net than any of the three searches used to satisfy it.

The instinct on a persistent flag is to doubt the check. **Invert it: the check is enumerating something, and you are sampling.** Ask what its corpus is and reproduce that corpus before concluding it is wrong. Same finding as the instrument-reach family, from the other side — there the tool's reach was too narrow and its number too small; here the human's reach was too narrow and the tool was right.

**A count measured without the gates the page actually applies is a different number from the one a user sees, and both look equally authoritative in a commit message.**

Issue 1's commit messages say the sport filter took chip-reachable instructors from **4 of 15 to 11**. The real figures are **3 of 11 to 10**, and 11 once migration 171 applies. The measurement queried `users_discoverable` and counted rows whose `sports` array held a canonical sport. `/instructors` does three more things before rendering: it excludes organization accounts (T-GYM1, keyed on `featured_partners.business_type`), it drops anyone failing the five-field T-PROF1 completeness gate, and only then does it filter. Skipping those put **Leo Garcia** in the "now reachable" list -- he is a `gym` account and has never appeared on that page at all.

Both numbers are true statements about _something_. Only one is a statement about what an instructor or a searcher experiences, and nothing in the smaller number's presentation reveals which kind it is.

**Before quoting a count in a commit message or a report, name the surface and apply every filter that surface applies.** In this codebase that means: the row-visibility view (`users_discoverable` excludes soft-deleted, banned and test accounts), any exclusion list (organization accounts), and any completeness or eligibility gate, in the order the DAL applies them. Replicate the DAL function rather than writing a fresh query -- the fresh query is how the gates get left out.

Same family as the instrument findings ([[the `[^<>]` and `vercel ls` entries above]]), and the mechanism is the mirror image: there the tool could not see everything that was there, here the tool saw more than the user ever would. A number that is too big reads exactly as confidently as a number that is too small.

**A FOURTH INSTANCE, and the clearest: 157 was the number of Spanish strings the guard could SEE, not the number that exist.**

The accent sweep on 2026-09-17 reported 157 strings and shipped a CI guard over them. Two days' worth of confidence in that number was misplaced in two independent ways, both found by reading one file's copy by eye.

**Hole 1, the word list is an allow-list by inversion.** `REQUIRES_ACCENT` held **60 words**. It enumerates what to CHECK, so every Spanish word nobody thought of may lose its accent with the guard green. Found live in the `/instructors` empty state, a screen that had been read several times that day: `busqueda`, `mas`, `mi`. The most damning was `recuperacion` in the legal copy -- the seed already held **nineteen** `-ción` words, so the family was obviously known, and this one still slipped, because the seed lists words rather than the rule.

**Hole 2, a fifth source shape was never scanned.** Pattern (c) was `/language\s*===\s*'es'\s*\?\s*'([^']*)'/` -- it requires a STRING after the `?`. The codebase also writes

```ts
return language === 'es'
  ? { pageTitle: 'Ayudanos a Mejorar', title: 'Titulo', ... }
  : { ... }
```

an object literal, which that pattern matches not at all. Measured: **254 Spanish strings across 15 files** are invisible to the guard in this shape, and **3 of them violate words already in the seed** (`Titulo`, `Descripcion`, `descripcion` in `app/feedback/useFeedback.ts`). Those three are the proof the shape hole is real rather than theoretical: the guard had the rule and could not see the string.

So the real Spanish surface is at least **411** strings, and "157 covered" described the instrument.

**`mi` is the floor of the whole approach, and it is worth knowing where the floor is.** `mi` (possessive, "mi perfil") and `mí` (stressed pronoun, "cerca de mí") are different words. Seeding `mi -> mí` would fail on every "mi sesión" in the app. **No word list of any size catches `Cerca de mi`** -- it needs the grammatical role, not the spelling. It is in `DELIBERATELY_EXCLUDED` with that reasoning, so the next person knows it was considered and not missed.

**The rule.** When a sweep returns a count, that count is a property of the sweep until you have shown otherwise. Before quoting it: enumerate the SHAPES the source can take and prove the scanner sees each one (one mutation per shape -- the rule that already found two holes here), and say plainly whether the matching is a rule or a list, because a list is an allow-list wearing the other way round. Same family as `[^<>]` breaking on `=>`, `vercel ls` writing status to stderr, and counting instructors without the gates the page applies -- **four instances in two days of a number that described the tool rather than the thing.**

**A TEST AT THE WRONG LAYER FOR THE DEFECT. Fifteen passing tests with the bug fully restored, because the bug does not live in what the component does.**

The instructor storefront editor was copying `users.bio` into `users.instructor_bio`, leaving the column that `/profile/[userId]` and `/search` still display behind as stale. The mechanism was one prop expression at the call site:

```tsx
initialBio={profile.instructor_bio || profile.bio || ''}
```

Fifteen behaviour tests covered that component — what it writes, what it never writes, when its empty state appears. Restoring that exact expression left **all fifteen green**, because they mount the component with props they supply themselves. They can see everything the component _does_ and nothing about how it is _called_.

**When a bug lives in how a component is called rather than in what it does, component tests cannot reach it, however many you write.** Ask which layer the defect actually occupies before choosing the instrument:

- behaviour inside the component -> mount it and assert on its output
- **what the component is handed** -> assert on the CALL SITE, in source. `components/dashboard/StorefrontEditor.callsite.test.ts` parses the `<StorefrontEditor ... />` props out of the dashboard and fails if `initialBio` reads `bio` at all. Same shape as `lib/sports.singleSource.test.ts`.
- whether a module imports rather than redeclares -> source scan (the sport-list guard)
- data-state left by a migration -> a check in `verify-migration-state.sql`

**And the mutation that proves such a guard is restoring the original call-site expression**, not a variation on it. A guard written for a one-line prop expression is only shown to work by putting that line back.

**Close the obvious way to make the new guard pass without fixing anything.** The call-site guard has a third case asserting the two bio props do not read the same column -- otherwise someone silences the first case by passing `instructor_bio` to both, and the empty-state note becomes permanently wrong instead. That is the same instinct as the allow-list rot test in the sport-list guard: both assume the next person will reach for the cheapest way to make the suite green, and both take it away in advance. **When you add a guard, spend one more minute asking how you would satisfy it dishonestly, and assert against that too.**

**A REFERENCE CORPUS CAN BE WRONG IN THE EXACT DIMENSION YOU ARE CHECKING, and then it makes the guard confidently wrong instead of silently incomplete.**

Replacing the accent guard's hand-written word list meant taking a Spanish dictionary as a dev dependency. `an-array-of-spanish-words` looked ideal: **636,598 wordforms**, 8.3 MB, no engine needed, pure data. It is **ASCII-FOLDED**. It contains `busqueda`, `mas`, `dia`, and does not contain `búsqueda`, `más`, `día`, `sesión`, `información`, `corazón`. It keeps `ñ` and strips every acute accent.

Had it shipped, the guard would have asserted that **`busqueda` is valid Spanish** -- a spell-checking accent guard whose dictionary has no accents. That is worse than the 60-word list it replaced: an incomplete guard stays quiet about what it cannot see, while a guard reading a folded corpus actively certifies the misspelling. It would also have "passed" its own mutation tests, because a mutation reverting `búsqueda` to `busqueda` produces a word the corpus says is fine.

**Before trusting a reference corpus, probe it for the exact property you are checking.** Not its size, not its name, not its download count. Three lookups would have settled it: is `búsqueda` in here, is `busqueda` in here, and is exactly one of them?

**And note how it was caught.** Not by inspection -- I had already written an analysis on top of it that reported "14,148 unambiguous accent rules derivable", a confident and entirely fictional number. It was caught because a sanity probe on the words this session had actually tripped over returned **`busqueda` -> not in the dictionary at all**, which made no sense for a 636,598-word Spanish list and was the thread worth pulling. The lesson is to include known-answer cases in the first probe of any new data source, precisely so a nonsensical result surfaces before the analysis built on it does.

What works instead is `nspell` (42 KB, pure JS, no native build) plus `dictionary-es` (880 KB Hunspell). Verified against the same known-answer set before being trusted: `busqueda` -> `búsqueda`, `dia` -> `día`, `informacion` -> `información`, `cuentanos` -> `cuéntanos`, and `mas`/`mi`/`anos` correctly declined as ambiguous because the unaccented form is also a real Spanish word.

**THE HARNESS THAT CHECKS EVERYTHING ELSE WAS UNDERCOUNTING ITSELF. A green suite summary is a claim about the tests that RAN, not about the tests that EXIST, and the two are only the same number if something asserts it.**

Repeated full-suite runs of an UNCHANGED commit, 2026-09-18:

```
201 of 204 files   1838 tests   3 runner errors
204 of 204 files   1869 tests   0
201 of 204 files   1843 tests   0   <- reported GREEN, three files never ran
```

Vitest reports a dropped file by shrinking its own denominator. The run exits 0, the summary says passed, and a partial run is indistinguishable from a complete one at the only place anyone looks. The three "runner errors" in the first line were `STACK_TRACE_ERROR` with stacks entirely inside `@vitest/runner` -- no application frames, no assertion message. Nothing was broken; workers were dying, and the loss surfaced either as a smaller denominator or as a failure pinned to an arbitrary test.

Every other instrument finding in this file is a tool undercounting the thing it MEASURED. This is the first where the thing doing the checking silently reduced its own coverage and called it success. `npm run test:complete` now compares files-run against files-on-disk and fails naming the difference.

**IT WENT UNNOTICED BECAUSE THE NUMBER MOVED IN THE DIRECTION THAT LOOKS LIKE PROGRESS.** Across one day the suite reported 1836, 1854, 1869, 1874. That reads as a suite growing, and some of it was -- but some of those differences were the denominator moving. **A count that goes up is not audited the way a count that goes down is.** A drop invites "what broke?"; a rise invites nothing at all. When a total changes, establish which way and why before deciding it is good news, because only one of those two directions gets questioned by instinct.

**And the near-miss on the diagnosis is the part worth remembering.** A pre-merge run read 1836 against 1854 measured minutes earlier on the same branch -- exactly 18 tests, exactly the three new files. It was written off as "a stale run", with the evidence already in hand and no explanation offered for how a run goes stale. The correct reading only surfaced later, while chasing something else entirely. **The comfortable explanation was available, cost nothing to accept, and was wrong.** When a number does not reconcile, "probably a flake" is a hypothesis with a testable consequence -- run it again and count -- not a reason to move on.

**Parallelism was left alone on purpose.** `--no-file-parallelism` made the drop rarer but not impossible (one file still went missing) and cost 3296s against ~30s. A 110x slowdown for a partial fix is not a trade. The reporting is the defect and it is a defect at any pool setting.

**And record equivalent mutants rather than quietly dropping them.** `setSessions(null)` → `setSessions([])` in `ProfileUpcomingSessions` cannot be killed: both render nothing and both still log. That is not a coverage gap and no test should claim to cover it — say so, and note what would make the difference observable (here, adding an empty state).

**`tierFor` resolves a LABEL, not an entitlement — never gate on `tier === 3`.**

`tierFor` (`lib/dal/participants.ts`) lets an UPCOMING shared session outrank a PAST one, because two people training together next week are more connected than two who trained in March. So a pair who share **both** history and a shared plan resolves to **tier 2**, not 3.

That means gating a tier-3 feature on `tier === 3` hides it from exactly the people with the strongest relationship in the app. Caught while building T-ATH1 step 8; the upcoming-sessions list now gates on `hasTrainedTogether` — membership of the `past` set — and the resolved tier only decides what to call the relationship.

Gate on the underlying relation (`tiers.past.has(id)`, `tiers.upcoming.has(id)`). Use the resolved tier for copy and styling, never for access.

**THE SAME CONSTANT NAME IN FIVE MODULES IS NOT FIVE CONSTANTS, IT IS ONE DEFECT.**

`SPORTS_LIST` is declared independently in five files — `lib/sports.ts` (23 sports), `app/onboarding/instructor/page.tsx` (21), `app/instructors/InstructorsPageClient.tsx` (13), `app/training-partners/page.tsx` (11) and `components/FindTrainingPartners.tsx` (11). None imports another. Because each shadows the name in its own module scope, **nothing ever collides and nothing ever warns.** They drifted until an instructor who teaches Jiu-Jitsu could not tag it: the onboarding chips offer `Martial Arts`, and `Jiu-Jitsu` exists only in the canonical list.

Exactly one pair had a sync guard — `lib/sports.ts` ↔ `lib/sportTranslationData.ts` — and its header says the guard "fails if they drift." It works. It covers the one pair that was never the problem.

**A shared vocabulary belongs in one exported constant that every consumer imports, and a guard must cover EVERY pair, not the pair someone happened to think of.** When you find a second copy of a list, assume there is a third.

**FIXING THE SAME STRING IN TWO PLACES IS A SIGNAL, NOT A CHORE.**

The Spanish accent work changed `Natación` and `Fútbol` in **both** `lib/sports.ts` (`SPORTS_TRANSLATIONS`) and `lib/sportTranslationData.ts` (`sportTranslations`) — two translation maps for the same 23 keys. Both edits were made without registering that their both existing _is_ the bug. The duplicate map was then still there to diverge again.

If a change has to be applied twice to take effect, stop and ask why there are two. The second edit is the codebase telling you where the real defect is, and it is the cheapest moment to notice — you already have both files open.

**A MIGRATION NUMBER IS CLAIMED BY WHOEVER MERGES FIRST — RE-READ `origin/main` IMMEDIATELY BEFORE CHOOSING ONE.**

On 2026-09-18 two sessions working the same repo both wrote a migration `172`. One built `172_reviews_self_review_policy.sql` on a branch forked at `5cc7420`; the other merged T-LEAD1 to `main` at 09:18 that morning and took **172 and 173**. Neither re-read `main` before numbering. Nothing warned: the files never touch the same table, the branches never conflict, and each is internally consistent.

**Read `origin/main` at the moment you choose the number, not at branch time.** The gap between forking and writing is exactly where a parallel session lands — the first branch had been cut, rehearsed, applied and verified in that window. A number inferred from the local branch describes the repo as it was when you forked, which is the one moment it is guaranteed not to still be true.

```bash
git fetch origin && git ls-tree --name-only origin/main supabase/migrations/ | tail -5
```

Rehearsal and capture filenames carry the number too, so they collide silently alongside it.

**It surfaced only because the merge was attempted rather than assumed.** The branch had been reported merge-ready; `git merge` is what printed the second `172`. A branch is not merged because it is finished, and "ready to merge" is a claim about the branch, not about `main`. Run the merge — the collision costs one rename when caught there, and becomes two files named `172_*.sql` in `supabase/migrations/` the moment it is not.

The number moves, not the record: rename, then state in the header what it was applied as and why it changed. An applied migration renumbered in silence is worse than the collision.

**"NO CODE CHANGED" IS NOT THE SAME CLAIM AS "NO TEST READS THIS".**

Migration 174 was merged and pushed without running the suite, on the reasoning that the merge brought in only SQL and therefore could not affect tests. `main` was red for the rest of the session. `supabase/verify-migration-state.test.ts` **enumerates `supabase/migrations/`** and fails when a migration has no branch in `verify-migration-state.sql`, so a file containing nothing executable broke a test by existing.

A test that enumerates a directory, counts files, or reads a manifest has no diff to inspect. Reading the diff and concluding "nothing here can fail" only works for tests that import the changed code, and you do not know which tests those are until they run.

**The full suite runs on every merge, whatever the diff looks like.** `npm run test:complete` is the way to know it ran — it compares files-run against files-on-disk, so a green summary is a claim about the tests that exist and not only the ones that happened to load. See [[the harness-undercounting entry above]].

**A CAST IN A TEST FIXTURE REMOVES THE ONE CHECK THAT WOULD TELL YOU THE FIXTURE IS WRONG.**

A test written for the T-AUD15 share separator built its fixture with invented field names (`hostName`, `location`, `startTime`) and silenced the resulting type error with `as never`. `buildSessionShareText` reads `instructorName`, `neighborhood` and `time`, so it received `undefined` for all three, and **the separator under test was never exercised on a full string.** The test passed on a two-token string. Only a deliberately wrong expectation exposed it.

This is the second time: the `as unknown as Session[]` on the storefront card (2026-08-23) hid four phantom fields the same way.

The type checker is the only thing that knows whether a fixture matches what the function reads. `as never`, `as unknown as X` and `as any` each turn that check off at exactly the moment it is load-bearing, because a fixture is a claim about a shape and nothing else verifies it. **Type the fixture, never cast it.** If it will not typecheck, the fixture is wrong — which is the finding, not an obstacle to the test.

**A GUARD THAT STARTS SEEING A CASE AND STILL PASSES IT IS A SECOND FINDING, NOT A SUCCESS.**

Fixing an instrument's reach tells you nothing about its judgement, and the two fail independently. When a guard is extended to cover a case it was blind to and the case still passes, do not book that as coverage restored — ask whether the rule can decide the case at all, because a widened blind spot and a rule that cannot fire look identical from the outside: green.

The worked instance is below, and the rest of this entry is how both halves came to be blind at once.

**A guard that tests membership against a canonical form can only see rivals already using that form.**

Two guards, same blindness, found the same afternoon.

`sports.singleSource.test.ts` built `new Set(SPORTS_LIST)` and asked whether an array's elements were members. `SPORTS_LIST` is Title Case. Three lowercase vocabularies sat in `app/` and `components/` through the sweep that found the other five — invisible for no reason except casing. Case-folding the comparison surfaced **five** files, not the three that had been found by hand.

`i18nGuards.test.ts` recognised five source shapes and every one keyed on an `es` marker: an `es:` property, `language === 'es'`, a `...Es` export. `app/global-error.tsx` has none, and cannot — it renders when the layout tree is broken, so the provider may be what died, and it prints both languages as sibling JSX nodes. The guard passed 8 of 8 over "Algo salio mal" for as long as it existed.

Both reported green over precisely the divergence they were written to catch. A canonical-form check is a test for _near_-copies; the dangerous copy is the one that drifted furthest, and it drifted out of the guard's reach on the way.

**When a guard checks conformance to a shape, ask what a NON-conforming instance looks like.** That is the thing it is blind to, and it is also the thing you are looking for. Write the answer down as a rival entry or as a new shape, and never as a silent assumption that everything worth finding resembles what you already have.

**The worked instance.** With shape (f) added, `salio` still did not flag, because `dictionary-es` accepts it — the "not Spanish, but an accenting of it is" rule could never fire on it. Two independent blindnesses stacked on one string: the extractor could not see it, and the rule could not judge it. Fixing only the visible half would have left the string shipping under a guard that now claimed to cover it.

**THIS IS THE DOMINANT FAILURE MODE IN THIS CODEBASE, NOT A RECURRING COINCIDENCE.**

Instances, in two days: the `[^<>]` regex that broke on `=>`; `vercel ls` writing the status column to stderr while the monitor read stdout; the accent sweep that saw 109 of 411 strings because it knew three of five shapes; the ASCII-folded dictionary that could not fail on `busqueda`; the harness that dropped three test files and reported green; the sports guard above; the accent extractor above. **Seven, of which the last two are the fourth and fifth to surface in this single sweep.**

Stop treating each one as a surprise. The prior should now be that **an instrument's number describes the instrument** until something independent says otherwise — a mutation, a second measurement taken a different way, or a probe of a case the instrument claims does not exist. Budget for that check on every guard, before trusting what it reports.

**A TEST CAN ENCODE THE BUG AS ITS ASSERTION, SO THE SUITE DEFENDS THE DEFECT AND FIXING IT LOOKS LIKE BREAKING SOMETHING.**

`notification-i18n.test.ts:119` and `notify-join/route.test.ts:252` both asserted `toContain('salio')`. Their intent was sound — check that the Spanish leave-notification does not fall back to the English verb "left" — and to express it they pinned a literal from the copy. The copy was misspelled, so the assertion made the misspelling the contract. When the accent guard finally caught `salio`, the fix turned two green tests red, and the suite was arguing for the defect.

This is worse than an uncovered defect. An uncovered defect is silent; this one has a test standing behind it, and the obvious reading of a red suite is that the change was wrong.

**When a test asserts a literal string from user-facing copy, it is asserting that copy is correct.** The assertion is only ever as good as the copy was on the day it was written, and nothing re-examines it afterwards. Prefer asserting the property the test actually means — here, that the English verb is absent, not that a particular Spanish spelling is present. Where a literal is genuinely the clearest expression, say in a comment which file owns that string, so the next person changing the copy knows a test is holding the other end.

**AN INSTRUMENT CHOSEN ON A NUMBER THAT MEASURED THE WRONG POPULATION.**

The Spanish dictionary was adopted on the strength of **"45 of 64 hand-seeded words become derivable"**. That number is true, and it measured **the hand list**. The question it was taken to answer was whether the dictionary could replace hand-maintained accent knowledge across Tribe's Spanish — a question about **the corpus**.

Measured against the corpus a day later: 4,354 strings, 2,088 distinct unaccented words, and the rule discriminates **3 of them**. Everything else falls in a blind zone where `dictionary-es` accepts both spellings and the rule is structurally silent. Both numbers are correct. Only one answers the question that was asked.

The seed was, by construction, a list of words someone had already noticed were ambiguous and worth writing down. Asking how many of _those_ a dictionary can derive is close to asking how well it handles the cases selected for being handleable. 70% on that population says nothing about the 2,088.

**Before adopting a tool on a benchmark, name the population the benchmark was computed over and check it is the population you will run against.** A number computed over the seed, the sample, the fixtures, or the known-failures list is a statement about that set. The tool will not be run against that set; it will be run against everything.

This is the **eighth** instance of the instrument-reach family, and the first where the instrument was _selected_ on a misaddressed measurement rather than merely _reporting_ one. The earlier seven distorted what was found. This one distorted what was adopted, which is more expensive because it is the decision everything downstream rests on, and nothing re-examines a choice that was justified once.

The dictionary was kept, and it is still worth having — it makes `LEAVE_UNACCENTED` auditable and it did catch `busqueda`. What changed is the claim made for it: it is a filter over a hand-maintained list, not a replacement for one. The work is done by the both-ways discriminator in `i18nGuards.test.ts`, which asks a question the corpus can answer without judging Spanish at all.

**A GUARD THAT SCANS A DIRECTORY CONTAINING ITS OWN CONFIGURATION WILL FIND ITS CONFIGURATION.**

The both-ways accent arm scans every source file under the repo root for Spanish strings. `lib/i18n/spanishAccents.ts` is one of those files, and it holds `LEAVE_UNACCENTED` — a list of the exact unaccented word forms the guard exists to reason about. So the literal `'unete'` in the exemption list entered the corpus as if it were product copy, and the pair `unete`/`únete` stayed flagged **after every real occurrence in the product had been corrected**. The instrument had counted itself as data.

`stripComments` does not catch this. The existing guard already strips prose, because an earlier version flagged `t('fields.photo')` inside its own explanatory comment. This is a step past that: the contamination is a **string literal in executing code**, indistinguishable from product copy by any textual rule.

**What caught it is the part worth keeping.** Not review, not reading the file — a **revert test whose expected outcome did not arrive**. Fix the defect, expect the flag to clear, and it did not. Nothing else in the session would have found it; the guard was green in every ordinary run and simply wrong about one word.

So the value of a revert is not only proving a check can fail. **A revert with an unexpected result is a finding about the instrument**, and it is the only routine moment when a guard is asked to explain itself. When a revert does not do what you predicted, stop and account for the difference before adjusting the prediction.

Before writing a guard that walks a tree, ask what of the guard's own apparatus lives inside that tree: config, fixtures, allow-lists, seed data, the test file itself. Exclude it by path, explicitly, with the reason.

### Database Schema

Core tables in `supabase/schema.sql`:

- `users` - Profiles linked to Supabase Auth
- `sessions` - Training sessions with location, sport, date/time
- `session_participants` - Join table with status (pending/confirmed)
- `match_requests` - Request system for curated sessions

**A public route is not the same as visible content.** `/` does not redirect, but logged out it renders `LandingPage` — the home feed and everything mounted inside `{f.user && ...}` is invisible without a session, including `FeaturedPartnerBanner`. `/storefront/[id]` and `/instructors` redirect outright. So **nothing on the authenticated feed can be verified in a browser without signing in**, and changes to it must be confirmed on a device before merging rather than on CI alone. Two banner changes shipped broken on iPhone in September 2026 because "the route is public" was read as "the surface is observable".

**Anything that renders for logged-out visitors reads sessions through `public.sessions_public`, never `public.sessions`.** Migration 140 revoked `anon` from the base table, so a query against `sessions` passes every test — the DAL is mocked — and returns zero rows in production for every signed-out user.

RLS enabled on all tables. Key policies allow:

- Public read on sessions/users
- Users can only modify their own data
- Session creators can manage their sessions

### API Routes

Located in `app/api/`:

- `/api/cron/*` - Scheduled jobs (reminders, motivation, followups)
- `/api/notifications/*` - Push notification endpoints
- `/api/geocode` - Location geocoding
- `/api/auth/signup` - User registration

### Session Join Policies

Sessions have three join policies:

- `open` - Anyone can join immediately
- `curated` - Host reviews and approves requests
- `invite_only` - Private, requires direct invitation

## Environment Variables

Required in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Deployment Notes

The app is deployed to Vercel with the Node.js runtime (NOT static export). All pages use `'use client'` but API routes run server-side in production. Key notes:

- All pages use `'use client'` (no Server Components)
- API routes work in both development and production on Vercel
- Images are unoptimized (`images: { unoptimized: true }`)
- For Capacitor mobile builds, the static HTML pages are bundled into the native app

## Product context and decision filter

Before implementing anything, understand the product intent in `docs/`:

- `docs/Tribe_Founding_Document.md` — the north star. Tribe is the home of the
  everyday athlete; its niche is promoting other people and making them visible.
- `docs/Tribe_Strategy_Reconciliation_Spec.md` — how the promotion posture and the
  two-sided marketplace fit together (they are two halves of one flywheel).
- `docs/Tribe_Founding_Doc_Tickets.md` — the small, phased task list.

Master filter for any change: does this make a user (instructor or athlete) more
visible, more seen, or more backed? If not, question whether it belongs now.

Discipline rule: these docs change defaults, not the backlog. Do NOT expand them
into new build work. Implement only the specific ticket I hand you, scoped as written.
Layer 3 items (Tribe.TV, sponsorship marketplace, events, media production) are
PARKED and must not be built during validation.
