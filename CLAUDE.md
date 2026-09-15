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

Caught three times in 24 hours on 2026-09-13/14, each time producing a confident wrong answer that survived until something unrelated contradicted it:

| the check that was written                    | what it actually answered                         | what it missed                                                                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "is `IOSInstallPrompt` present on the page?"  | whether that component was mounted                | a CTA whose destination auto-navigated to the App Store. Both suppression checks passed while the page still ejected a visitor in one tap.                                                   |
| `.select()` scanned with a single-line window | whether a column list happened to fit on one line | `fetchUserProfile`'s multi-line list, producing an 18-column "dead" list. Revoking it would have failed the profile page's main read with `42501`, invisible to every test.                  |
| `grep getServiceRoleClient`                   | whether a file spells the helper that way         | two routes that build a service client inline with `createClient as createServiceClient`. Would have widened the `users` UPDATE allowlist by five Tribe.OS columns for every logged-in user. |

The rewrites that worked, in the same order: look for _any_ element that intercepts a tap at the heading's centre and follow _every_ link to where it lands; parse the call rather than a line; ask whether the file constructs a client with `SUPABASE_SERVICE_ROLE_KEY` by any spelling.

Same family as the privilege rule below: `has_table_privilege` answers "can this role do it", `information_schema.table_privileges` answers "is there a row that says so". Prefer the capability question every time.

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
