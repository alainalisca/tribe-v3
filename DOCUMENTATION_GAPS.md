# Documentation Drift Report

**Scan date:** 2026-04-03
**Scanned against:** CLAUDE.md, README.md, CONVENTIONS.md, engineering-standards.md, docs/ADR.md

---

## Undocumented Routes

CLAUDE.md documents: `/api/cron/*` (reminders, motivation, followups), `/api/notifications/*`, `/api/geocode`, `/api/auth/signup`. The following API routes exist but are not mentioned in any documentation:

| Route | File |
|---|---|
| `/api/cron/engagement` | `app/api/cron/engagement/route.ts` |
| `/api/cron/session-reminders` | `app/api/cron/session-reminders/route.ts` |
| `/api/cron/weekly` | `app/api/cron/weekly/route.ts` |
| `/api/feedback/widget` | `app/api/feedback/widget/route.ts` |
| `/api/generate-calendar` | `app/api/generate-calendar/route.ts` |
| `/api/notify-admin-signup` | `app/api/notify-admin-signup/route.ts` |
| `/api/notify-nearby` | `app/api/notify-nearby/route.ts` |
| `/api/send-attendance-notification` | `app/api/send-attendance-notification/route.ts` |
| `/api/send-guest-confirmation` | `app/api/send-guest-confirmation/route.ts` |
| `/api/send-inactive-nudge` | `app/api/send-inactive-nudge/route.ts` |
| `/api/send-weekly-recap` | `app/api/send-weekly-recap/route.ts` |
| `/api/webhook/chat-message` | `app/api/webhook/chat-message/route.ts` |

The following app pages are also undocumented (CLAUDE.md lists no specific pages):

| Page | File |
|---|---|
| `/admin` | `app/admin/page.tsx` |
| `/feedback` | `app/feedback/page.tsx` |
| `/invite/[token]` | `app/invite/[token]/page.tsx` |
| `/legal/*` (privacy, terms, safety, delete-account) | `app/legal/*/page.tsx` |
| `/matches` | `app/matches/page.tsx` |
| `/messages` | `app/messages/page.tsx` |
| `/requests` | `app/requests/page.tsx` |
| `/stories` | `app/stories/page.tsx` |
| `/training-now` | `app/training-now/page.tsx` |

---

## Undocumented Database Tables

CLAUDE.md documents: `users`, `sessions`, `session_participants`, `match_requests`. The following tables were created in migrations but are not documented:

| Table | Migration File |
|---|---|
| `live_status` | `supabase/migrations/add_live_status.sql` |
| `reviews` | `supabase/migrations/add_reviews.sql` |
| `session_stories` | `supabase/migrations/add_session_stories.sql` |
| `session_recap_photos` | `supabase/migrations/create_session_recap_photos.sql` |
| `session_templates` | `supabase/migrations/create_session_templates.sql` |

Additionally, significant columns added via migrations are not reflected in the schema documentation (e.g., `equipment`, `gender_preference`, `skill_level` on `sessions`; `fcm_token`, `average_rating`, `total_reviews`, `is_admin`, `preferred_language` on `users`).

---

## Undocumented Environment Variables

CLAUDE.md documents only: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The following env vars are referenced in code but not documented:

| Variable | Used In |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Multiple API routes (notifications, feedback, webhook, notify-nearby) |
| `RESEND_API_KEY` | Email routes (notify-admin-signup, send-weekly-recap, send-guest-confirmation, send-inactive-nudge, send-attendance-notification, feedback widget) |
| `NEXT_PUBLIC_GOOGLE_PLACES_KEY` | `lib/google-maps.ts`, `app/api/geocode/route.ts` |
| `GOOGLE_MAPS_SERVER_KEY` | `app/api/geocode/route.ts` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | `capacitor.config.ts` |
| `NEXT_PUBLIC_POSTHOG_KEY` | `lib/posthog.ts` |
| `NEXT_PUBLIC_POSTHOG_HOST` | `lib/posthog.ts` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `lib/notifications.ts`, `app/api/notifications/send/notificationHelpers.ts` |
| `VAPID_PRIVATE_KEY` | `app/api/notifications/send/notificationHelpers.ts` |
| `VAPID_EMAIL` | `app/api/notifications/send/notificationHelpers.ts` |
| `CRON_SECRET` | Multiple cron routes |
| `NEXT_PUBLIC_SITE_URL` | Multiple API routes |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | `app/api/notifications/send/notificationHelpers.ts` |
| `WEBHOOK_SECRET` | `app/api/webhook/chat-message/route.ts` |

No `.env.example` file exists in the project.

---

## Undocumented Files/Directories

CLAUDE.md documents: `app/`, `components/`, `lib/`, `contexts/`, `supabase/`, `messages/`. The following significant directories and files are not mentioned:

| Item | Description |
|---|---|
| `hooks/` | Custom React hooks directory |
| `types/` | TypeScript type definitions directory |
| `scripts/` | Utility/build scripts (screenshot generators, app store asset tools) |
| `middleware.ts` | Next.js middleware (Supabase auth session refresh) |
| `vercel.json` | Vercel deployment configuration |
| `vitest.config.ts` / `vitest.setup.ts` | Test framework configuration |
| `android/` / `ios/` | Capacitor native project directories |
| `docs/ADR.md` | Architecture Decision Records |
| `engineering-standards.md` | Referenced in CLAUDE.md but not described in directory structure |
| `loadtest.js` | Load testing script |

---

## Undocumented Dependencies

CLAUDE.md documents: Next.js, Supabase, Tailwind CSS, Capacitor, PostHog, Leaflet/React-Leaflet. The following significant dependencies in `package.json` are not mentioned in the Tech Stack section:

| Dependency | Purpose |
|---|---|
| `firebase` / `@capacitor-firebase/messaging` | Firebase Cloud Messaging for native push notifications |
| `web-push` | Server-side Web Push protocol support |
| `resend` | Email sending service (mentioned in API route descriptions but not in Tech Stack) |
| `@radix-ui/*` | UI primitive components (alert-dialog, avatar, dialog, label, select, separator, slot, toast) |
| `class-variance-authority` / `clsx` / `tailwind-merge` | shadcn/ui styling utilities |
| `react-hot-toast` | Toast notification UI (library not named, only helpers documented) |
| `date-fns` | Date utility library |
| `canvas-confetti` | Confetti animation effects |
| `ics` | iCalendar file generation |
| `vitest` / `@testing-library/*` / `jsdom` | Testing framework and utilities |
| `husky` / `lint-staged` | Git hooks for code quality |
| `puppeteer` | Browser automation (used for screenshot generation) |
| `jsonwebtoken` | JWT handling |

---

## Summary

| Category | Gaps Found |
|---|---|
| Undocumented API routes | 12 |
| Undocumented app pages | 9 |
| Undocumented database tables | 5 |
| Undocumented environment variables | 14 |
| Undocumented files/directories | 10 |
| Undocumented dependencies | 14 |
| **Total gaps** | **64** |

The most critical gaps are the 14 undocumented environment variables (no `.env.example` exists) and the 5 undocumented database tables, as these directly impact developer onboarding and understanding of the data model.
