# Changelog

All notable changes to Tribe v3.

## [2.3.0] - 2026-02-25

### Security
- Add auth guards to 3 unprotected API routes (notify-nearby, send-attendance-notification, geocode)
- Remove debug notification test endpoint and unused firebase-admin dependency

### Fixed
- Replace raw error.message toasts with bilingual user-friendly messages
- Fix N+1 query in AttendanceTracker (batch lookup instead of per-participant)
- Add capacity check to guest join flow (prevents over-enrollment)
- Fix sessions page header clipping with dynamic measurement
- Standardize header-to-content spacing across all pages
- Add double-tap protection to join button
- Add error boundaries to prevent white screen crashes

### Added
- `lib/logger.ts` centralized logging
- `lib/errorMessages.ts` bilingual error message mapping
- `lib/dal/sessions.ts` Data Access Layer with 7 typed functions
- `lib/database.types.ts` generated Supabase types with convenience aliases
- 26 unit tests (Vitest) for joinSession, DAL, and errorMessages
- ESLint + Prettier + Husky pre-commit hooks
- `engineering-standards.md` (10-section SOP)
- `CONVENTIONS.md` (UI spacing patterns)
- 15 Claude Code enforcement skills

### Refactored
- Type all extracted component props (eliminate `any` from 9 components)
- Extract `useLiveStatus` and `useSessionActions` hooks from session detail page (640 to 439 lines)
- Extract home page into FilterBar + LiveNowSection components
- Extract session detail page into 6 focused components
- Unify join logic into `lib/sessions.ts`

## [2.2.0] - 2026-02-15

### Added
- Training Now (go live) — users can mark themselves as actively training
- Session stories with upload and viewer
- Recap photos for past sessions
- Attendance tracking for session hosts
- Auth middleware for centralized route protection
- Merge my-sessions into /sessions with past history and time filtering

### Fixed
- Fix Safari auth issues with hard redirects
- Fix date picker timezone bug
- Fix React Server Components CVE vulnerabilities

## [2.1.0] - 2026-02-01

### Added
- Host ratings and reviews
- Equipment needed field on sessions
- Gender filter (women-only, men-only, all welcome)
- Session reminders (1hr and 15min before)
- Distance from me on session cards
- Guest join and unjoin flow
- Skill level selection on sessions
- Central messages inbox
- Forgot password flow
- Push notifications for chat messages

### Fixed
- Fix empty rectangle on home screen during loading
- Fix duration picker display format
- Fix edit session page routing

## [2.0.0] - 2026-01-15

### Added
- Complete rewrite on Next.js 16 with Supabase
- Session creation, joining, and management
- Real-time group chat per session
- Push notifications (FCM + APNs via Capacitor)
- Location-based session discovery
- Bilingual support (English/Spanish)
- Admin dashboard
- Profile with avatar, bio, and sports
- Comprehensive notification system (50+ bilingual messages)
- TWA preparation for Android
