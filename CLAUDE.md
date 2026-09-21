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

**A MIGRATION PASTED INTO CHAT IS A PATH TO PRODUCTION THAT DOES NOT TOUCH GIT. THE BRANCH MERGES BEFORE THE PASTE, NOT AFTER.**

Migrations 175 and 176 were applied to production and were not on `main`. They reached the database entirely outside version control: the file was pasted into chat, run in the SQL editor, and the branch carrying it sat unmerged. The apply and the merge were **fully decoupled**, and nothing in the process would have caught it. It surfaced only because something unrelated sent me back to that file.

This is the same applied-and-untracked state that merging 172 was supposed to prevent — and the rule did not hold, because the rule assumed applying a migration and merging its branch were parts of one act. Pasting breaks that: the paste is the apply, and the merge is a separate thing someone has to remember.

**So the order is fixed. Merge the branch, then paste. If the branch cannot be merged — it is red, it is unreviewed, it depends on something unlanded — the paste is not sent.** A migration that is not safe to merge is not safe to run, and sending it anyway converts a blocked merge into an unrecorded production change.

Practically: paste the file **after** `git push`, and say in the same message which commit on `main` the pasted text corresponds to. That gives the person running it a way to check they are running what is recorded, which is the property the whole numbered series exists to provide.

**AND THE VERIFIER CANNOT CATCH THIS CLASS. IT IS A DETECTOR OF THE SYMPTOM.**

`verify-migration-state.test.ts` has now earned its place twice — it caught 174 with no verifier branch, and it caught 175 and 176 the same way. Both times it turned `main` red the moment the migration files arrived.

**That is exactly why it cannot prevent this.** It fires when a migration file appears in `supabase/migrations/` without a matching probe — which requires the merge to happen. The failure mode here is **the merge not happening**, and a guard whose trigger is the action that was skipped is structurally blind to its own worst case. If nobody had ever merged that branch, the verifier would have stayed green forever while two migrations ran in production unrecorded.

Generalise it: **a check that runs on an event cannot detect the absence of that event.** CI that runs on push cannot see work never pushed; a test that runs on merge cannot see a merge never made; a lint on commit cannot see a change committed elsewhere. When the risk is that a step is skipped, the detector has to hang off something that happens **anyway** — a scheduled reconciliation, or a comparison against the system of record. For migrations that means asking production what it has and diffing it against the directory, on a timer, not on a merge.

**THE EXECUTABLE SQL OF AN APPLIED MIGRATION IS IMMUTABLE. ITS COMMENTS ARE APPEND-ONLY. CORRECTIONS GO IN A DATED ADDENDUM AT THE BOTTOM, NEVER BY EDITING THE ORIGINAL TEXT.**

A migration's header is not documentation of the SQL. It is the record of what
was **believed** when it ran, and that belief is usually the interesting part,
because a migration that was wrong about something was wrong for a reason
somebody will hit again. Editing it in place produces a file that is correct
about the database and silent about how it got that way, which is the one thing
the file could tell you that nothing else can.

So the shape of every correction is the same:

- The text above the addendum line is the file **as it ran**, mistakes included.
- The addendum is dated, says what is wrong above it, and says what is true.
- If the correction was already made before the migration was applied, the
  addendum says so, so a reader can tell a live defect from a fixed one.
- Nothing executable changes, ever. A migration that needs different SQL needs a
  **new migration**.

Both failure modes had already happened when this was written. 178's header was
corrected in place after it had been applied -- comments only, well-intentioned,
and it erased the evidence that the renumber had left stale references behind.
179 shipped with a write-site list naming a file that cannot write. Neither is
visible from the database, and neither would ever fail a check that only asks
production what it has.

**IT IS A TEST, NOT A CONVENTION, AND THAT DISTINCTION IS THE WHOLE LESSON OF
THE NUMBER COLLISIONS.** "Re-read `origin/main` before choosing a migration
number" was written down, understood and agreed, and then broken three times,
because a rule that depends on remembering fails on the day you are busy. The
duplicate-number test found every instance in its first run. `supabase/migrationImmutability.test.ts`
hashes each migration's executable text against `supabase/migrations_frozen.json`
and fails on any change at or below the highest frozen number; new migrations
above that line stay editable until they are applied and frozen with
`scripts/freezeMigrations.ts`.

**The extractor is a tokeniser, not a regex, and that was not gold-plating.**
`line.replace(/--.*$/, '')` is wrong on this repo's own files: 179's abort
message contains `-- do NOT widen this to a range` **inside a quoted string**. A
regex stripper truncates there, and the resulting hash is still perfectly
_stable_ -- which is what makes it dangerous. The guard would look like it
worked while every character after a `--` inside any string literal became
invisible to it, so an applied migration's `RAISE` text could be rewritten
silently. Proven by mutation: editing that string is rejected, appending an
addendum is allowed.

Comments **inside** `$$ ... $$` count as executable and are deliberately not
stripped. A function body is stored verbatim in `pg_proc`, so editing a comment
in one really does change a database object -- migration 177 exists precisely
because a live function's body could not be recovered from this repo. Addenda
belong at the bottom of the file, outside every block.

**And the obvious dishonest fix is named in the failure message**: running
`scripts/freezeMigrations.ts` to make this test pass records the change instead
of rejecting it. Regenerate the manifest only when adding a migration.

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

**AND THE CAPABILITY FUNCTION HAS ITS OWN NARROWER SCOPE, WHICH IS NOT VISIBLE IN ITS NAME.** `has_table_privilege(role, table, 'UPDATE')` answers "is UPDATE held **at table level**", not "may this role update anything in this table". For a column-level grant it returns a confident `false` while the role genuinely holds the privilege. Measured on production 2026-09-20, after `GRANT UPDATE (contacted_at) ON public.pass_leads TO authenticated`:

| call                                                                     | answer  |
| ------------------------------------------------------------------------ | ------- |
| `has_table_privilege('authenticated','public.pass_leads','UPDATE')`      | `false` |
| `has_any_column_privilege('authenticated','public.pass_leads','UPDATE')` | `true`  |
| `has_column_privilege(...,'contacted_at','UPDATE')`                      | `true`  |
| `has_column_privilege(...,'email','UPDATE')`                             | `false` |

So: **when the question is "does this role hold X on this table AT ALL", use `has_any_column_privilege`** — it is true for a table-level grant _or_ a grant on any single column, and strictly subsumes the table-level form. `has_table_privilege` is correct only when the question is specifically about a table-level grant, which is rarely what a guard means.

This is the rule above read the wrong way round. Both halves of it stay true; what does not follow is that `has_table_privilege` is _the_ capability question for every subject. `public.users` in this codebase is under column-level grants throughout, so the wrong form here is silently wrong on the table most worth guarding.

Found by migration 175's rehearsal, arm D7. The guard asserting that no client role holds UPDATE on `pass_leads` — the guarantee the whole `set_pass_lead_contacted` design rests on — stayed green while `authenticated` held UPDATE on a column. A later migration granting `UPDATE (email)` would have passed it, and a partner could then rewrite a lead's phone number and address, which is exactly what migration 173 refused to allow through an UPDATE policy. The guard was green on every ordinary run and simply wrong; only deliberately reintroducing the mistake exposed it.

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

**A COVERAGE CHECK PROVES EVERY FILE HAS A PROBE. IT DOES NOT PROVE EVERY FILE IS DISTINCT.**

`verify-migration-state.test.ts` walks `supabase/migrations/` and fails when a migration has no matching probe. It has earned its place repeatedly. It also ran over **two duplicate migration numbers for five months without a word**: `013_fix_social_rls_policies` and `013_product_storefront`, `014_referrals` and `014_session_comments`, all from the 2026-04-19 bulk import.

It was not broken. **Both files answered its question the same way** — each had a probe, so each passed — and "is this number used twice" was never a question it asked.

Writing the duplicate-number test found all of them in the first run, including the 175 collision it was written for. **So the cost of not having that check was not five months of risk. It was five months of not knowing**, and the difference matters: the risk was real the whole time, but the fix was always one test away and nobody had reason to look.

**A check that maps A to B proves the mapping is total. It says nothing about A being distinct, ordered, well-formed, or reachable.** Those are separate properties and each needs its own assertion. When a guard walks a collection, write down what it is actually asserting about that collection, then ask which of the other obvious properties nobody is checking:

- every file has a probe — **but are the filenames unique?**
- every consumer imports the constant — **but do two constants exist?**
- every policy has a reason — **but do two policies overlap?**
- every test file ran — **but did two of them test the same thing?**

The pattern across this repo is consistent: the second question is never asked because the first one passing _feels_ like coverage. A green guard is evidence about one property, and the number of properties it is silent about is unbounded.

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

**AND THE SHARPEST INSTANCE, BECAUSE IT WAS ACTED ON RATHER THAN RECORDED: "THIS ROUTE IS DYNAMIC" IS NOT "THIS APP IS DYNAMIC".**

`headers()` was added to the root layout to serve the right `lang` in the first frame. The justification, written into the commit and into the report that got it approved, was that it cost nothing because _"every route in this app is already `ƒ (Dynamic)`"_. That was never measured. It was carried over from the `/instructors` investigation, where it was true of **one route**, and generalised to all of them.

**The build had 79 static routes. The change took it to 2** — `robots.txt` and `sitemap.xml`, the only two rendering no React.

**The two claims differ by one word and by 77 routes**, and that is why nothing caught it. "This route is dynamic" and "this app is dynamic" read as the same sentence at a glance, and the second is the kind of claim that sounds like background knowledge rather than a measurement anyone owes evidence for. `npm run build` prints the static/dynamic table. It takes one command. Nobody ran it, including the author of the claim.

**A fact measured over one route describes one route.** Before reusing a measurement as a premise somewhere else, say out loud what population it was taken over, and re-measure if the new population is larger. This is the same error as adopting a tool on a benchmark computed over the seed — the difference is only that this one was _acted on_, so it shipped.

**AND THE FAILURE IT CAUSED WAS SCOPED TO A TRIGGER NOBODY WATCHES.**

The consequence was that `/` stopped prerendering, so `.next/server/app/index.html` stopped existing, so the home-page bundle budget failed with "run the build first". It failed **only on `pull_request` runs and never on `push`**, because a `pull_request` build is the branch merged into main while a `push` build is the branch alone. So main's own workflow stayed green while every PR opened against it went red, and the breakage looked like a property of whichever PR surfaced it.

**"Main is green" is a claim about what main's workflow runs, not about main.** A check that fires on only one trigger is invisible from the other. When a failure appears on PRs but not on main, or on one environment but not another, the first question is which triggers run which checks — not which PR introduced it. And when adding a check that depends on build artefacts, know which triggers produce those artefacts, because a check that cannot run is indistinguishable from a check that passes.

Found and reverted by a parallel session in `01bd163`, which kept most of the value by making the static `lang` `"es"` instead of `"en"` — wrong strictly less often, with no request needed — and named middleware as the right home if per-request negotiation is ever wanted.

**A GUARD THAT SCANS A DIRECTORY CONTAINING ITS OWN CONFIGURATION WILL FIND ITS CONFIGURATION.**

The both-ways accent arm scans every source file under the repo root for Spanish strings. `lib/i18n/spanishAccents.ts` is one of those files, and it holds `LEAVE_UNACCENTED` — a list of the exact unaccented word forms the guard exists to reason about. So the literal `'unete'` in the exemption list entered the corpus as if it were product copy, and the pair `unete`/`únete` stayed flagged **after every real occurrence in the product had been corrected**. The instrument had counted itself as data.

`stripComments` does not catch this. The existing guard already strips prose, because an earlier version flagged `t('fields.photo')` inside its own explanatory comment. This is a step past that: the contamination is a **string literal in executing code**, indistinguishable from product copy by any textual rule.

**What caught it is the part worth keeping.** Not review, not reading the file — a **revert test whose expected outcome did not arrive**. Fix the defect, expect the flag to clear, and it did not. Nothing else in the session would have found it; the guard was green in every ordinary run and simply wrong about one word.

So the value of a revert is not only proving a check can fail. **A revert with an unexpected result is a finding about the instrument**, and it is the only routine moment when a guard is asked to explain itself. When a revert does not do what you predicted, stop and account for the difference before adjusting the prediction.

Before writing a guard that walks a tree, ask what of the guard's own apparatus lives inside that tree: config, fixtures, allow-lists, seed data, the test file itself. Exclude it by path, explicitly, with the reason.

**A MECHANICAL REWRITE CAN PRODUCE A CLASS THAT DOES NOT EXIST, WHICH IS NOT A WRONG VALUE BUT NO VALUE, APPLIED SILENTLY.**

Migrating 54 screens from hardcoded `pb-32` to a `.pb-nav` utility, a find-and-replace over `pb-\d+` also hit `lg:pb-24` and produced **`lg:pb-nav`**. Tailwind variant prefixes compose with Tailwind utilities; `.pb-nav` is a plain CSS class in `globals.css`. `lg:pb-nav` therefore matches nothing, generates nothing, and applies **no padding at all** at that breakpoint.

Nothing reports this. It is not a build error, not a type error, not a lint error, and not a wrong number that looks odd in review — it is an absent rule. The class name reads correctly to a human scanning the diff, which is the whole problem.

The same pass also rewrote `pb-40` and `lg:pb-24` **inside the comments explaining them**, turning prose into a description of a class that does not exist.

**After a mechanical rewrite, enumerate the syntactic positions the original token appeared in and check what the replacement produces in each — not just the common one.** For a Tailwind class that is at least: bare in a `className`, under a responsive or state variant, inside `clsx`/template interpolation, in an `@apply`, and in prose. A replacement that is valid in the common position can be inert, invalid, or meaningless in the others, and the failure mode of "inert" is the one nothing will tell you about.

**WRITE THE GUARD WITH THE MIGRATION, NOT AFTER IT, BECAUSE THEY FAIL DIFFERENTLY ON THE SAME FILE.**

The guard for this migration was written in the same change and immediately found a screen the migration had missed: `app/challenges/[id]/page.tsx` has **two** `min-h-screen` page-root branches, and the regex pass rewrote one and left `pb-12` on the error state — 48px against a 122px requirement.

That is not luck, it is the point. **The migration was mechanical and the guard was not.** A regex sweep is thorough about the pattern it matches and blind to everything shaped differently — a second return branch, a variant prefix, a template literal. A guard written from the requirement enumerates a _population_ (every file rendering `<BottomNav>`) and asks a question of each. The two have uncorrelated blind spots, which is exactly why running them together finds things neither finds alone.

Written afterwards, the guard would have been built to pass against the migrated tree, and `pb-12` would have looked like a screen the guard simply did not cover. **A guard written after a migration tends to encode the migration's blind spots as its scope.**

**A SPATIAL CLAIM NEEDS NUMBERS. A DESCRIPTION THAT SOUNDS LIKE SEPARATION IS NOT A MEASUREMENT OF SEPARATION.**

T-AUD14 was reported as _"does not reproduce as described: the button is `absolute bottom-3 right-3` and the hint is centred in a `relative z-0` flex column, so corner-anchored rather than overlapping."_ Every word of that is true, and the two elements overlap by 12 of the hint's 16 pixels at every viewport width.

**"Corner-anchored" and "centred" are both true of two elements that overlap.** The description was a restatement of the class names, and it reads as an argument because the words sound like opposite ends of the box. Nothing in it is a distance.

The arithmetic is four lines and closes it either way:

```
box height (h-40)                              160px
centred content  40+4+4+20+4+16              =  88px
free space at each end  (160-88)/2           =  36px
control needs  bottom-3 + own height (12+36) =  48px  ->  12px overlap
```

**Before claiming two elements do or do not touch, compute the interval each occupies and intersect them.** If the numbers are not in the report, the claim has not been made. This is the human-side twin of the guard entries above: there an instrument reported the shape it was built to see; here a description was mistaken for a measurement, and the conclusion was drawn from the vocabulary rather than the geometry.

The cost was not the bug. It was that the ticket **was not queued**, because "does not reproduce" is a verdict that stops work. A wrong measurement gets re-measured; a wrong verdict gets filed.

**AND THE LIST ITSELF: THREE OF TWENTY-FOUR TICKETS CHANGED STATUS ON A SECOND LOOK.**

In one pass over the T-AUD list, reviewed against current `main` rather than against the ticket text:

- **T-AUD11** was recorded as fixed; it was not reproducing, which is a different claim with a different follow-up.
- **T-AUD24** was a different ticket than the status list said — the status-bar item is T-AUD6, and T-AUD24 is iOS Geolocation and Haptics, still reproducing.
- **T-AUD14** was recorded as not reproducing while reproducing on every phone.

The list was built on 2026-09-03 against a bundle that no longer exists. **Every entry in it deserves arithmetic or a measurement rather than a reading**, and a status inherited from a stale audit is a hypothesis, not a finding. The error rate on second look was 3 in 24 — high enough that the prior for any unverified entry should be "unknown", not "as recorded".

**A PERMISSION QUESTION NEEDS A BEHAVIOURAL PROBE, NOT A CATALOG READ. GRANTS, RLS AND TRIGGERS EACH DENY INDEPENDENTLY, AND A CATALOG SHOWS YOU ONE OF THE THREE.**

`information_schema.column_privileges` reported UPDATE on `public.users` granted to `authenticated` at table level **and** on all 97 columns individually. From that I reported that any signed-in user could write their own `is_admin` — "one PATCH grants admin". It was wrong.

The probe, run as a real authenticated non-admin:

```
is_admin                 BLOCKED   users_is_admin_guard (migration 043)
banned                   BLOCKED   users_banned_guard   (migration 098)
is_verified_instructor   BLOCKED   protect_verified_instructor_trigger -- IN NO FILE IN THIS REPO
lead_credits_remaining   SUCCEEDED
deleted_at               SUCCEEDED
```

Three of five writes the catalog said were permitted were refused, by three different objects, two of which I had already read and one of which does not exist in the repository at all.

**The grant is necessary, not sufficient.** A write has to clear the grant, then the RLS policy, then every `BEFORE UPDATE` trigger. Reading one of those three and reporting a conclusion about the other two is the same shape as reading `revalidate = 60` and concluding the route was static: a real measurement of the wrong layer.

**Run the write. As the role that would run it.** Four outcomes distinguish four causes, and they are worth knowing apart:

| What you see                                 | What denied it                        |
| -------------------------------------------- | ------------------------------------- |
| `42501 permission denied for column`         | the grant                             |
| `new row violates row-level security policy` | a `WITH CHECK`                        |
| `UPDATE 0` with no error at all              | a `USING` clause filtered the row out |
| a `RAISE` message naming something           | a trigger, and the message names it   |

**The corollary is the one that generalises furthest: a probe finds controls that exist only in production.** A catalog read of the _repo_ can only show what the repo knows about. `protect_verified_instructor` is live, `SECURITY DEFINER`, and appears in no migration — so `supabase db reset` produces a database where a signed-in user can verify themselves as an instructor, and `is_verified_instructor` is the only gate on the lead reach-out path. That is DB-02's category, but worse than its usual form: not a missing table, a **missing security control**, invisible to any audit performed against this repository.

And the reverse of the same coin, found in the same pass: `public.users` has at least six policies in production and two in the repo, three of the four permissive UPDATE policies appearing nowhere here. **Where a table's protection is concerned, absence of evidence in the repo is not evidence of absence in the database — in either direction.**

**PERMISSIVE POLICIES OR TOGETHER, SO THE EFFECTIVE RULE IS THE LOOSEST ONE PRESENT. TIGHTENING ONE CONSTRAINS NOTHING AND LOOKS LIKE A FIX.**

`public.users` carries four permissive UPDATE policies. Postgres grants the write if **any** of them admits it, so adding a `WITH CHECK` to one, or narrowing its `USING`, changes the answer for exactly zero rows while reading in review as a security fix. The only way a policy edit restricts anything is if it is the last permissive policy for that command, or if the others are edited in the same change.

**This codebase already hit that wall and solved it without naming it.** `Users can view all profiles` is still `FOR SELECT USING (true)` — wide open. Every restriction on reading `users` comes from **column grants** (066, 067, 113), not from RLS, and 113's header explains the instrument choice without explaining the constraint that forced it. With a `USING (true)` policy present, no added SELECT policy could ever have restricted a column. The grant was the only tool that could work.

So, on a table with multiple permissive policies for the same command:

- **A column-level restriction must come from a trigger or a grant.** Policies gate rows, and only the loosest one matters. This is why the three guards that actually protect `users` are `BEFORE UPDATE` triggers and a column-grant regime, not policy predicates.
- **Count the policies for that command before editing any of them.** `select policyname, cmd, permissive, qual, with_check from pg_policies where tablename = '...'`. Editing one of four is a no-op; the count is the first thing to know and it is one query.
- **`RESTRICTIVE` is the exception and it is rare.** A restrictive policy ANDs instead, so it _can_ tighten a permissive set. Nothing in this repo uses one. If you reach for that, say so explicitly, because every other policy here reads as permissive by default and a reviewer will assume the same of yours.

The general form: **when several rules combine with OR, no single one of them is load-bearing for denial, and editing any single one is theatre.** The same reasoning applies to a chain of `.or()` filters in a DAL query, to overlapping CORS allowlists, and to any "is this allowed" check assembled from independently-authored pieces.

**A POINTER TO SOMETHING YOU CANNOT FIND IS A FINDING ABOUT THE THING POINTING, NOT A GAP IN WHAT YOU WERE GIVEN.**

`protect_verified_instructor()` carries two comments reading _"UNCHANGED, deliberately. See the second box above before touching this."_ Handed the full 33-line body, I read those as referring to context I had not been shown, and filed a ticket saying the reason had to be found before the branches could be changed.

There is no box above. **Line 008 is the first line after `BEGIN`.** Nothing precedes it inside the function, so the boxes lived in whatever source file this was authored in — and that file is not in the repository, which is the same gap the capture existed to close, showing up from the inside.

The reference was not a hint that something was withheld. It was **evidence that the function had been separated from its source**, and therefore evidence about how it came to be undocumented. Read correctly it answers a different and more useful question: not "what was the reason" but "the reason is unrecoverable, so decide on the merits."

This is the same move as reading _"corner-anchored"_ and _"centred"_ as separation: taking words at face value instead of checking them against the structure. Both times the check was cheap — count the lines above, intersect the intervals — and both times not doing it produced a confident conclusion that stopped work.

**When a comment, a ticket, a test name or an error message refers to something you cannot locate, resolve the reference before acting on it.** Three outcomes, and they are not close to each other:

- **It exists and you missed it.** Go read it.
- **It cannot exist** — as here, where the position rules it out. That is a fact about the artefact's history and usually the more useful finding.
- **It existed and is gone.** Then whatever it explained is now undocumented, and anyone who defers to it is deferring to nothing.

The failure mode is treating all three as the first one, because that is the polite reading and the only one that requires no work. It is also the one that blocks: "find the reason first" is unsatisfiable when the reason is unrecoverable, and an unsatisfiable precondition stops a decision indefinitely while looking like diligence.

**A GUARD AFTER THE WRITE IS A REPORT, NOT A GATE. A HAND-RUN MIGRATION THAT REPLACES AN OBJECT MUST CHECK FOR A LATER MIGRATION BEFORE WRITING.**

Migration 175 captures `protect_verified_instructor()` as it existed before 176 converted two of its branches. As first written it did this:

```
line 120   CREATE OR REPLACE FUNCTION ...   -- the pre-176 body, silent reverts and all
line 169   DO $$ ... assert 1 RAISE and 2 silent reverts ... $$
```

The assertion was right, the body was right, and the ordering made it a weapon. **The Supabase SQL editor autocommits statement by statement**, so there is no transaction wrapping those two. Re-run 175 after 176 and line 120 commits the silent reverts back over the fix; line 169 then aborts. The operator sees one red error and reads it as _"the migration failed, so nothing happened"_ — while the security fix has just been silently reverted.

**The guard could not prevent anything. It could only describe the damage, after the damage.**

Two things make this worse than a one-off:

**Re-running is the normal case, not the exotic one.** These migrations are hand-applied by a person reading a file. Files get re-run to confirm they applied, after a connection drop, when someone is unsure whether the first attempt took, or when a rebuild replays the directory in order. Every migration in this repo is written to be idempotent precisely because re-running is expected — and idempotence is exactly what makes a stale capture dangerous rather than noisy, because it applies cleanly.

**The shape is not specific to migrations.** Any script that writes and then validates has it: a seed that inserts then counts, a backfill that updates then checks drift, a config deploy that pushes then verifies. If the write can be wrong and the validation is what would tell you, the validation belongs **first**, phrased as a precondition on the state you are about to overwrite.

So:

- **A capture migration must refuse to run if the thing it captures has since been changed.** Read the live object, compare it to what you are about to write, and abort _before_ writing if a later migration has superseded it. 175 now opens with a pre-flight block that does this and names 176 in the error.
- **Absence is fine and must be distinguished from mismatch.** The same pre-flight lets a missing object through, because that is a fresh rebuild, which is what a capture is for.
- **Where the tool gives you a transaction, use it.** A single `DO` block is one statement and therefore atomic; 174 is built that way on purpose. 175 could not be, because `CREATE OR REPLACE FUNCTION` cannot live inside a `DO` without `EXECUTE` and a quoting layer that would have obscured the verbatim body — so the pre-flight is the substitute, and the file says so.

**When a check exists only to produce a message, ask what it would have prevented had it run earlier. If the answer is "the thing it is reporting", move it.**

**A SECURITY CONTROL MUST NOT DEPEND ON ROLE IDENTITY THAT DIFFERS BETWEEN THE TEST HARNESS AND THE RUNTIME.**

A `BEFORE UPDATE` guard on `public.users` exempted writes made inside the `SECURITY DEFINER` RPC by testing `current_user IS DISTINCT FROM session_user`. `SET ROLE` changes `current_user` and leaves `session_user` alone, so that looked like a clean way to ask "was I reached through a definer function".

**It is not, because `session_user` is a property of how the connection was made.**

|                | `session_user`  | direct write as `authenticated`                | inside the definer RPC         |
| -------------- | --------------- | ---------------------------------------------- | ------------------------------ |
| **SQL editor** | `postgres`      | DISTINCT → exemption fires → **guard skipped** | not distinct → **RPC blocked** |
| **PostgREST**  | `authenticator` | DISTINCT → exemption fires → **guard skipped** | DISTINCT → RPC works           |

The rehearsal failed in the harness with the RPC blocked. **In production it would have gone green while the guard did nothing at all** — the exemption fires for every caller, because `authenticated` is never equal to `authenticator`. One line, two environments, wrong in both, and only one of them visibly.

**A trigger cannot distinguish "`current_user` was changed by SECURITY DEFINER" from "changed by `SET ROLE`"** without knowing the expected baseline, and the baseline is environment-dependent. There is no fix by choosing a better predicate. `set_config('app.x', …, true)` does not help either: `GRANT SET ON PARAMETER` covers superuser-restricted GUCs, not `app.*` placeholders, so a flag the trigger trusts is a flag the caller sets.

**Remove the need for the signal instead of finding a better signal.** The counter lived on a row the user owns, which is what created the question. Moved to its own table with no write grant to `authenticated`, there is nothing to exempt: the definer RPC writes it, service-role writes it, the caller cannot, and no code asks who it is.

**And if a test asserts on `current_user` or `session_user`, it must first assert what they are.** Otherwise the assertion is silently about the harness. A rehearsal arm that prints both before anything else costs one row and makes every role-dependent result readable.

**A MUTATION DRIVER MUST ASSERT THAT EACH MUTATION ACTUALLY CHANGED THE FILE. A MUTATION PROOF THAT SILENTLY DOES NOT MUTATE REPORTS SUCCESS.**

This is the worst shape an instrument failure can take, and it is worth putting
above the others in this file: every other bad instrument gives a wrong answer,
while this one gives **the right answer to a question it never asked**, and the
answer is "your guard works."

Proving the `cover_image_url` guard, the driver was a shell loop:

```bash
FILES=$(git diff --name-only | grep -E '\.tsx?$')
for f in $FILES; do cp "$f" /tmp/_orig.bak; ... done
```

**zsh does not word-split unquoted parameters.** In bash `$FILES` expands to 17
words; in zsh it expands to one string containing 17 newline-separated paths. So
the loop ran once, with a "filename" that was the entire list. Had `cp` and
Python been quieter about it, the run would have printed seventeen lines of
`caught` -- because the guard would have been run seventeen times against an
**unmodified tree**, where it passes, and a passing guard under a mutation is
reported as the mutation being caught... or, depending which way the driver
reads it, as every mutation being missed. Either reading is fiction.

**It was caught by accident.** `cp` said `No such file or directory` and Python
raised `SyntaxError: unterminated string literal`, both because the one giant
"path" was malformed. Nothing in the driver's own logic would have noticed; the
loop had no check that the file it was about to test had actually changed. A
tidier mutation -- one that happened to be a legal no-op rather than a syntax
error -- would have sailed through silently.

**So the driver asserts the mutation landed before it interprets the guard's
response**, and asserts the restore landed afterwards:

```python
orig = p.read_text()
assert 'cover_image_url' in orig          # there is something to revert
p.write_text(orig.replace('cover_image_url', 'storefront_banner_url', 1))
assert p.read_text() != orig              # THE MUTATION ACTUALLY HAPPENED
r = run_guard()
p.write_text(orig)                        # restore, pass or fail
assert p.read_text() == orig              # THE RESTORE ACTUALLY HAPPENED
```

Three assertions, and the middle one is the load-bearing one. Without it the
proof's conclusion does not depend on the proof having been performed.

**Generalise past shells.** Any harness that perturbs something and reads a
response has this hole: a chaos test that fails to kill the pod, a fixture that
does not get written, a feature flag that does not flip, an env var set in a
subshell that exits. **The perturbation needs its own assertion, separate from
the observation.** If the only evidence that a mutation occurred is that a test
went red, then a test that stays green is indistinguishable from a mutation that
never happened -- and that is precisely the case you are trying to detect.

And the shell lesson on its own: **write loops in a language whose splitting
rules you are certain of, or quote and set `IFS` explicitly.** This session's
`.zshrc`-driven default cost a silently-vacuous proof of a 17-file guard.

**FOR A SCHEMA CHANGE, THE TYPECHECK IS THE TEST AND THE SUITE IS NOT.**

Renaming `users.banner_url` / `users.storefront_banner_url` to
`cover_image_url` across 17 files, the state at one point was:

```
Suite complete: 226 of 226 test files ran, 2077 tests, 0 failures.
tsc --noEmit:   6 errors
```

**A fully green suite, and the code did not compile.** Not a flake, not a gap in
coverage that more tests would close -- a structural blindness. The tests mock
the DAL, so a column name never reaches a real query or a real row in any of
them. `.select('...cover_image_url')` against a mock returns the mock's fixed
object whatever you ask for, and a payload key that does not exist in the
database is just a key. **There is no assertion a unit test could make that
would notice.**

`tsc` noticed immediately, because `lib/database.types.ts` is generated from the
live schema and the Supabase client is generic over it. That file is the only
place in this repo where the database's shape is a compile-time fact.

So, for any change that renames, adds or removes a column:

- **`npx tsc --noEmit` is the verification step, and it is not optional.** Run
  it before the suite, because it is the one that can fail.
- **A green suite is not evidence about the change.** It is evidence the mocks
  still satisfy the code, which they will whatever you call the columns.
- **Regenerate or hand-patch the types FIRST.** Editing 17 files and then
  discovering the types are stale means 17 files of errors that all have one
  cause, which reads like a broken refactor rather than a missing prerequisite.
- The mirror of [["NO CODE CHANGED" IS NOT THE SAME CLAIM AS "NO TEST READS THIS"]]:
  there, SQL-only changes broke tests; here, a change touching only TypeScript
  broke nothing in the suite and everything in the compiler. **Neither instrument
  covers the other, and which one bites is not predictable from the diff's file
  extensions.**

**BEFORE VERIFYING A SURFACE, CHECK THAT IT RENDERS. A REQUEST TO VERIFY SOMETHING IS NOT EVIDENCE IT EXISTS.**

Asked to check the spotlight carousel after the `cover_image_url` deploy,
`components/SpotlightBanner.tsx` turned out to be **imported by nothing**. It is
a complete component, it has a DAL behind it, and `/api/cron/spotlight-rotation`
rotates its data on a schedule. It renders on no screen.

The easy failure here is not getting it wrong, it is **reporting it fine**. A
surface that does not render produces no visual regression, so "I checked and it
looks unchanged" is a true sentence and a useless one, and nothing downstream
would ever contradict it. The same applies to checking a feature flag that is
off, a route nobody links to, or an empty state that the data can never reach.

**So the first step of verifying a surface is locating where it mounts.** If you
cannot find the mount, that is the finding, and it outranks whatever you were
sent to look at. Here it also told us something about the rest of the app:
[[the nine dark features from 2026-08-23]] are the same shape, and this makes ten.

**WHEN A MEASURED NUMBER AND A GUARD DISAGREE, THE QUERY THAT PRODUCED THE NUMBER IS ALSO AN INSTRUMENT. CHECK IT, NOT ONLY THE GUARD AND ITS REHEARSAL.**

179's header recorded `only_legacy = 13`. Its guard, and the rehearsal, both
counted **14**. Two explanations were available: the data moved, or the two
counts are over different populations.

The populations were compared -- and the wrong pair was compared. 179's guard,
the rehearsal's G1 arm and the rehearsal's `reh_baseline` all read
`FROM public.users` with a byte-identical predicate and no filter. They agreed
perfectly, which was taken as ruling the second explanation out, so the first
was reported: _an instructor uploaded a banner between the capture and the
rehearsal_. **That event never happened.** The 13 came from the measuring query
that chose the five, which filtered `deleted_at IS NULL`. The fourteenth row is
a soft-deleted account. Same data, counted two ways, nothing changed.

**The measuring query was never a candidate, because it was an input.** Every
instrument downstream of the number was audited; the thing that produced the
number was treated as the fact those instruments were being checked against.
And it was the one link in the chain that could not be read: the guard, the
rehearsal and `capture_cover_conflicts.sql` are all in the repository and all
unfiltered, while the counting query was typed once into a SQL editor and never
committed. **The uninspectable step is the one that escapes the audit, and it
escapes precisely because there is nothing to inspect.**

This is the **tenth** instance of the instrument-reach family, and the first
where the mis-measured instrument was the SOURCE OF THE EXPECTATION rather than
the thing being checked against it. It is more expensive than the others for
that reason: a wrong instrument produces a wrong reading, but a wrong baseline
makes every correct reading look like a change in the world. The report was not
"the count is wrong" -- it was "someone uploaded a banner", a specific claim
about a person's actions, with no evidence and no upload.

Practically:

- **Two numbers disagreeing is a three-way question, not two-way.** The data
  moved, the guard is wrong, **or the baseline is wrong.** Enumerate all three
  before writing a sentence about any of them.
- **Ask where the expected number came from, and whether that query still
  exists.** If it cannot be produced and re-run, it cannot be compared, and its
  output is a hypothesis wearing a number's clothes.
- **Commit the measuring query.** `capture_cover_conflicts.sql` is in the repo,
  and that is why its `5` could be confirmed against the guard's `5` in one
  grep. A count that decides a migration's constants belongs in the same
  directory as the migration, for the same reason the migration is there.
- **A filter is part of a number's definition, not a detail of how it was
  fetched.** `13 legacy-only` and `14 legacy-only` are both true and are not the
  same statement. When recording a measurement, record the predicate with it.

**AND A HEADER THAT ASSERTS AN EVENT WHICH DID NOT HAPPEN IS WORSE THAN ONE
THAT SAYS NOTHING.** A missing explanation makes the next reader investigate. A
false one makes them look for an upload that does not exist, fail to find it,
and end up with a guard that fired for a reason nobody wrote down -- with the
investigation budget already spent. **Fabricated causes are more durable than
absent ones, because they stop the search.** The false claim is kept in 179's
header as an explicit correction rather than quietly deleted, so the next reader
sees that it was wrong and why.

**A SUBSTRING GREP OVER MINIFIED OUTPUT PRODUCES FALSE POSITIVES AND FALSE NEGATIVES AT THE SAME TIME. SOURCE IS WHERE THE PROPERTY IS DECIDABLE.**

After deploying the training-partners change, the shipped client bundle was
grepped to confirm no coordinate reaches the browser. The result:

```
6.2442 (the Medellin centroid):  16 chunks
location_lat:                    12 chunks
fetchNearbyAthletes:              0 chunks
```

Read at face value that says the centroid fallback is still everywhere. It is
not. **`6.2442` matches inside longer numerals** — the hits are
`6.2442,-75.5` and `6.2442,lng:-` belonging to the instructors map, the
location picker and `city-config.ts`, which legitimately centre a map on
Medellín. A map centre is not a ranking origin.

And the reassuring line is the weaker one. **`fetchNearbyAthletes: 0` proves
nothing**, because minifiers rename identifiers; an intact function under a
one-letter name is indistinguishable from a deleted one. So the same command
was simultaneously over-reporting the thing that was fixed and under-reporting
its own ability to see it.

**Minified output is not a corpus you can ask textual questions of.** Numbers
merge into other numbers, identifiers are gone, strings survive but lose the
context that made them meaningful, and module boundaries have dissolved. A
string literal like `users_discoverable` does survive — but it tells you _some_
code reads that view, not _which surface_, which was the actual question.

**Ask source instead, where the question is decidable**: which files reference
the token, which table each belongs to, and what the type that crosses the
boundary declares. That is what the guard already does, and it is mutation-
proven, which the grep can never be.

**The general rule: before quoting a count, ask what the corpus does to the
thing you are counting.** Minification renames and merges; ASCII-folding
strips accents ([[the Spanish dictionary]]); rounding collapses precision;
`2>/dev/null` discards the column being read. This is the ninth instance in
this file of a number that described the instrument rather than the thing, and
the first where a single command was wrong in both directions at once.

**And say so when the check you ran cannot answer the question.** The 16-chunk
hit was nearly reported as a finding. The correct report is that the bundle
grep neither adds to nor subtracts from what source already proves — an
inconclusive instrument written up as inconclusive, rather than a number
presented because it was available.

**A COLUMN NAMED FOR AN EVENT, BACKFILLED FOR EVERYONE, ANSWERS A QUESTION NOBODY ASKED — AND WILL BE READ AS ANSWERING THE ONE THEY DID.**

`users.onboarding_completed_at` sounds like "this user finished onboarding". It
is not. Its own comment says _"finished OR **DISMISSED** the first-run
introduction"_ — a walkthrough, where closing a tooltip counts — and migration
156 ended with:

```sql
-- One-time backfill: existing accounts are done, new ones are not.
UPDATE public.users SET onboarding_completed_at = NOW()
WHERE onboarding_completed_at IS NULL;
```

**Every account that existed on 2026-09-09 is marked complete**, whatever they
did. And `completeOnboarding()` in the DAL had **zero callers**, so nothing in
the running app ever set it — every non-NULL value is a backfill or a dismissed
tooltip.

**It misled a real decision.** A query joined it against empty profiles and
concluded _27 athletes completed onboarding and left sports and photo blank_,
pointing at a leaky wizard. There is no athlete wizard: the role page sends
athletes to `/profile/edit`, where every field is optional and sports are never
asked for. The conclusion survived — the fix was still needed — but it was
reached through a column that could not support it, and it could as easily have
sent the work to the wrong place.

**Three properties make a column like this dangerous, and they compound:**

- **A name that describes a milestone** rather than the narrow event it records.
  "onboarding_completed" invites the reading it got.
- **A backfill with no marker.** Nothing distinguishes a real completion from
  `UPDATE ... SET x = NOW()`. If a backfill is unavoidable, a `note` column or a
  distinguishable timestamp costs nothing at write time and everything later.
- **No live writer.** Dead code around a column implies the column means what
  the dead function says it means.

**So: when adding a state column, ask what a stranger would assume from the
name, and put the difference in the COMMENT — where a `\d+` shows it — not only
in the migration header nobody re-reads.** And never give an existing column a
second meaning to avoid a migration: the second meaning is invisible at the
query that misreads it. Migration 187 took `athlete_setup_completed_at` rather
than reusing this one, for exactly that reason, and sharpened 156's comment so
the next reader is told before they draw a conclusion.

**CODE THAT WRITES A COLUMN MUST NOT MERGE BEFORE THE MIGRATION ADDING IT HAS BEEN APPLIED — AND "ADDITIVE FIRST" DID NOT PREVENT IT, BECAUSE ONE BRANCH MADE TWO ACTS LOOK LIKE ONE.**

Migration 182 (`notifications.action_url`) and the code writing that column
merged in the same branch. The code deployed at **16:15 UTC**; the migration was
applied at **~16:50**. For thirty-five minutes `createNotification` put
`action_url` in **every** insert payload — there is no branch on notification
type — and PostgREST rejects an insert naming a column that does not exist.
**Every notification in the app failed, and nothing retries.** Joins, leaves,
reminders, reviews, follows, approvals: all lost, not queued.

The additive-first rule already covered this exactly. It failed anyway, and the
mechanism is the interesting part: **"merge the branch" and "apply the
migration" felt like one act because they lived in one branch.** The rule
assumed a human would notice a sequencing requirement that nothing in the
workflow made visible.

**So it is a test now, for the same reason the migration-number collisions
became one:** a rule that depends on remembering fails on the day you are busy.

**THE ENFORCEMENT NEEDED TWO LAYERS, AND THE SECOND IS WHAT MAKES THE FIRST
HONEST.** Applied-state lives in `public.migrations_applied` (migration 184).
Vitest runs with no database, so it cannot read that table. A committed mirror
is the only offline option — and a hand-kept applied record is precisely what
had _just_ drifted, being wrong about migration 181 within hours of being
written.

The resolution is not to trust the mirror, it is to have the database check it:

1. `migrationAppliedBeforeCode.test.ts` reads `supabase/migrations_applied.json`
   and fails the merge if any source file references a column introduced by a
   migration that file does not list as applied.
2. `verify-migration-state.sql` asserts that JSON **equals the table**, in both
   directions — a mirror claiming an unapplied migration would let bad code
   merge; a mirror omitting an applied one would block a good merge.

**A mirror that can drift undetected reproduces the failure it was built to
prevent. One the source of truth checks does not.** When a guard must run
somewhere that cannot see the authoritative state, do not settle for a copy —
copy it _and_ assert the copy, from the side that knows.

**And it needs a floor, or it is too loud to survive.** The record begins at
179, where 184's backfill starts; everything below predates the record and is
presumed applied. Without that, the guard fails on every column in the schema,
which is the state in which a guard gets deleted rather than fixed. The floor
is itself asserted — raising it above the lowest recorded migration would
silently exempt everything, and that mutation is one of the five in the proof.

**Proven by reproducing the outage**: mark 182 unapplied while the code still
writes `action_url`, and the guard rejects the merge.

**A DEFECT THE OWNER CANNOT SEE IS A DEFECT NOBODY REPORTS. THIRD INSTANCE.**

The same photo rendered at **128px to its owner and 96px to everyone else**.
`app/profile/page.tsx` drew the avatar at `w-32`; `ProfilePageClient.tsx` —
the OTHER-user profile — drew it at `w-24`. So every athlete's own profile
looked correct to them, and looked worse to every person who visited it.

Nobody reports that. The only person motivated to complain is the only person
who cannot see the problem.

**It is the third time this exact shape has produced a live defect here:**

|                                       | the owner saw               | everyone else saw                                                        |
| ------------------------------------- | --------------------------- | ------------------------------------------------------------------------ |
| the avatar crop (2026-09-19)          | a correct circle            | a stretched one, because `<img>` with no `object-fit` defaults to `fill` |
| the blank storefronts (migration 179) | their banner, on `/profile` | nothing, because the storefront read the other column                    |
| this                                  | 128px                       | 96px                                                                     |

Each shipped for months. Each was found by someone looking at the system from
outside, not by a user report, because **the feedback channel runs through the
person with the best view and the least reason to look.**

**So when a surface renders differently for the owner and for a visitor, that
asymmetry is itself the thing to check** — before looking for a bug in either
rendering. Practically:

- If a component has an "is this me" branch, **diff the two branches for
  anything that is not deliberately different.** Size, crop, fallback and
  loading behaviour are almost never meant to differ; only affordances are.
- **Two components rendering the same entity is the smell.** `profile/page.tsx`
  and `ProfilePageClient.tsx` both draw a user; the 32px difference was not a
  decision anyone made, it was two files drifting.
- **Test the visitor's view, not the owner's.** The owner's is the one that
  gets looked at during development, which is precisely why it is the one that
  stays correct.

The general form is already in this file for [[migration 179's thirteen blank
storefronts]]. What this instance adds is that it recurs in RENDERING, not only
in data — and that the tell is structural and greppable: an is-self branch, or
two components drawing the same thing.

**THREE INSTRUMENTS THAT SHARE AN EXTRACTION ARE ONE INSTRUMENT. A GUARD'S READING STEP MUST ASSERT IT READ SOMETHING BEFORE ASSERTING WHAT IT FOUND.**

The sharpest instance in this file, and the one to read first if you only read
one: a single guard, checked by three independent-looking instruments, vacuous
in all three for the same reason, all three reporting green.

Migration 180's whole purpose is that no coordinate or distance reaches the
client, so its load-bearing guard asserts the function's return type contains
no positional column. All three checks of that property did this:

```sql
JOIN pg_type t ON t.oid = p.prorettype
JOIN pg_attribute a ON a.attrelid = t.typrelid
```

**A `RETURNS TABLE` function has `prorettype` = `record`, and `pg_type.typrelid`
for `record` is 0.** The join matches no rows. The extraction returned NULL, and

```sql
coalesce(v_cols, '') !~* '(lat|lng|lon|distance|coord)'
```

reduces to `'' !~* '...'` — true of the empty string, true forever, true with
`distance_km` sitting in the signature. The migration would have applied. The
verifier would have said `applied`. The rehearsal said PASS.

**They were never three checks.** The migration's guard, the verifier probe and
the rehearsal arm were written at different times for different audiences, and
every one of them inherited the same wrong catalog join from the one before.
Independence of instruments is a property of their **reading step**, not of
their file, their author or their moment. Two checks that share how they obtain
the value share every blind spot in obtaining it, and the redundancy is
decorative.

**What caught it was that ONE of them printed what it read.** The rehearsal arm
put the extracted column list in its detail string, and it said
`returns: (none)` for a function that returns five columns. Al read the detail
rather than the verdict. Nothing else in the run disagreed with anything —
16 of 16 PASS — and no amount of re-running would ever have surfaced it.

**So, two rules, and the second is the one that generalises:**

- **Print what you read, not only the verdict you reached.** A check that emits
  `PASS` is unfalsifiable from the outside. A check that emits
  `PASS — saw: id, name, avatar_url, sports, shared_sport_count` can be checked
  by a human in one glance, and `(none)` is visibly absurd.
- **Assert the read SUCCEEDED before asserting what it found.** `IF v_cols IS
NULL OR length(btrim(v_cols)) = 0 THEN RAISE` is two lines, and without them
  every property asserted downstream is a property of the empty string. This is
  the same shape as [[C1 guarding C5–C7]] — an arm asserting an ABSENCE passes
  when the thing returns nothing at all, so the arm proving it returns
  something has to run first. A5 was the one arm in that rehearsal without such
  a guard, which is precisely where the vacuity was.

**AND THE MUTATION ARM IS WHAT PROVES THE READING STEP, NOT THE RULE.** Arm A6
now builds a throwaway `pg_temp` function that genuinely returns
`distance_km`, runs the **same** extraction against it, and asserts it is
flagged. Without it, A5 passing is only evidence that the detector is quiet,
and a detector that reads nothing is quiet about everything.

That arm should have existed from the first line of the guard. The general
form: **when a check searches for a forbidden thing, feed it a known example
of that thing and confirm it objects.** It costs one arm, it is the only
evidence that the search works at all, and it is exactly the mutation
discipline already recorded here, applied to the reading step rather than to
the production code.

**AND THE FOOTER SLIP, WHICH IS NOW THE SECOND IDENTICAL INSTANCE IN ONE DAY —
SAME FILE POSITION, SAME MISSING PREFIX.**

Both rehearsals' closing comments read
`-- The one result set. Every row must read PASS. N of N.` Both times the edit
ran `replace("-- Every row must read PASS. 16 of 16.", ...)`, and both times the
`-- ` prefix is not adjacent to `Every`, so the pattern matched nothing and the
replace silently did nothing. Both times the file then told the operator to
expect fewer rows than it emits.

**A rule written after the first instance did not prevent the second.** The
first was logged the same day, in a commit that said in so many words that a
replace matching nothing and a replace matching correctly are both silent. That
knowledge was available, recent, and did not fire.

So the fix is not another rule. The build now **parses the stated total back out
of the finished file and compares it against the seq literals the file can
emit**, including the ones produced by `row_number()`. The sentence cannot
disagree with the file, whether or not anyone remembers the lesson. Same
principle as the migration-immutability test: when a rule has already been
broken after being written down, replace it with something that cannot be
forgotten.

**MUTATION ARMS PROVE A GUARD _CAN_ FIRE. ONLY A SUCCESS ARM PROVES IT _WILL NOT_. A REHEARSAL WITH ONLY THE FIRST KIND CANNOT ANSWER "WILL THIS MIGRATION APPLY".**

179's rehearsal had four arms for its guard -- G1..G4, each reproducing the
guard with one input deliberately wrong, each asserting the abort message
arrives. All four passed. **They pass by construction**: an arm that feeds a
violated precondition to a working guard can only fire. None of them ran the
guard with TRUE inputs, and Part A spliced 179's body from the `INSERT` to the
first `UPDATE` -- straight past the `DO` block holding the guard.

So the rehearsal reported 19 arms green over a migration that **aborts on its
first guard**. `only_legacy` had moved from 13 to 14 between the capture and the
rehearsal, and nothing in the run said so. It surfaced because Al read a detail
string -- `blank storefront before=14` -- against a number in the header, and
asked why a probe and the guard it verifies disagreed about who counts.

**The diagnosis offered was also wrong, and wrong in the more expensive
direction.** The natural reading of "probe says 14, guard expects 13" is that
the two count different populations, and the natural fix is to align the
probe's filter. Both files read `FROM public.users` with no filter whatsoever --
no `deleted_at`, no `banned`, no test-account exclusion. **There was no filter
to align.** Had the probe been "fixed" to match a filter the guard does not
have, the rehearsal would have gone green and 179 would still have aborted, and
the next explanation would have had one more false step in it.

Two rules, and the second is the general one:

- **A rehearsal applies the migration's body INCLUDING its guards.** A body
  spliced around the guard is not that migration; it is the subset of it that
  was always going to succeed. Where the guard is a `DO` block and the rehearsal
  is itself plpgsql, `DO` cannot nest -- strip the wrapper and hoist the
  `DECLARE`s, keeping the predicates and `RAISE` messages verbatim.
- **For every guard, count the arms that prove it fires and the arms that prove
  it passes. If the second number is zero, the guard's satisfiability on the
  live database is untested** -- which is the only thing the person about to run
  the migration actually wants to know. The failure arms test the guard; the
  success arm tests the world.

This is the negative image of [[WRITE THE ARM FOR THE PART YOU CANNOT VERIFY]].
That entry says the uncertain part earns an arm. This one says the part you are
most certain of -- "of course the preconditions hold, I measured them" -- is a
claim about a database that other people are writing to, and it decays. A
measurement taken on Monday is a hypothesis by Friday, and the arm asserting it
still holds costs one row.

**And a number appearing in two places must be printed from one.** 179's
expected counts live in its guard; the rehearsal's B1 printed a count it
computed independently. They were free to disagree silently, and did. A2 now
prints all three live counts beside all three expected ones in a single row, so
a drift is a sentence rather than an inference across two arms.

**WRITE THE ARM FOR THE PART YOU CANNOT VERIFY, NOT THE PART YOU CAN.**

Of six arms in that rehearsal, one was written specifically because I said I was uncertain about the mechanism — _"arm C1 exists to catch this if the reasoning here is wrong too"_, in the migration's own comment. **C1 is the arm that caught it.** The arms covering the parts I was confident about all passed and told me nothing I did not already believe.

This inverts the usual instinct, which is to test what you understand well enough to predict the outcome of. Those tests are the cheapest to write, the easiest to make pass, and the least informative — a test whose result you can predict has already been run, in your head, and running it again confirms your model rather than the code.

**The uncertainty is the signal for where the test belongs.** When you catch yourself writing "this should work because…", that sentence is the specification for an arm. When you find yourself unable to finish the sentence, that is the arm that will earn its place. Two practical forms:

- Say in the comment _why_ the arm exists and what it would catch. If you cannot name a specific wrong belief it would falsify, it is probably testing something you already know.
- If a change rests on reasoning you could not confirm from source, the arm testing that reasoning is not optional and should not be the last one written.

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
- **Images ARE optimized.** `next.config` sets `images: { unoptimized: false }`.
  This line said the opposite until 2026-09-21, and the cost of that is worth
  recording: investigating avatar quality, it nearly led to the conclusion that
  `next/image` and a raw `<img>` render identically here, which would have made
  the two avatar render paths look interchangeable when they are not. A doc
  asserting the opposite of the config is worse than no doc, because it is
  checked less often than the config is.
  Consequence worth knowing: the native app loads the LIVE Vercel build
  (`capacitor.config.ts` sets `server.url`, overriding `webDir: 'out'`), so
  `/_next/image` optimization is available inside the app too.
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
