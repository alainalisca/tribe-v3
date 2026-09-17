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

**And record equivalent mutants rather than quietly dropping them.** `setSessions(null)` → `setSessions([])` in `ProfileUpcomingSessions` cannot be killed: both render nothing and both still log. That is not a coverage gap and no test should claim to cover it — say so, and note what would make the difference observable (here, adding an empty state).

**`tierFor` resolves a LABEL, not an entitlement — never gate on `tier === 3`.**

`tierFor` (`lib/dal/participants.ts`) lets an UPCOMING shared session outrank a PAST one, because two people training together next week are more connected than two who trained in March. So a pair who share **both** history and a shared plan resolves to **tier 2**, not 3.

That means gating a tier-3 feature on `tier === 3` hides it from exactly the people with the strongest relationship in the app. Caught while building T-ATH1 step 8; the upcoming-sessions list now gates on `hasTrainedTogether` — membership of the `past` set — and the resolved tier only decides what to call the relationship.

Gate on the underlying relation (`tiers.past.has(id)`, `tiers.upcoming.has(id)`). Use the resolved tier for copy and styling, never for access.

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
