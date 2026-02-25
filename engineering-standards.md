# Engineering Standards — Tribe v3

This document defines senior-engineer-level standard operating procedures for all code quality decisions in this project. Every section follows the same structure: what it means, what senior engineers do, why it matters, current state in Tribe v3, and action items.

---

## 1. Type Safety

### What it means
Every function, component, and data structure has explicit types. The compiler catches bugs before runtime.

### What senior engineers do
- Define interfaces/types for all component props, API responses, and database rows
- Use Supabase's generated types (`supabase gen types typescript`) instead of `any`
- Annotate return types on exported functions
- Use discriminated unions for state machines (loading | error | success)
- Reserve `any` only for genuinely dynamic data, always with a `// why: ...` comment

### Why it matters
- `any` types silently bypass the compiler — bugs reach production undetected
- Typed props enable autocomplete and catch mismatches during development
- Refactoring is safe when the compiler verifies every call site

### Current state in Tribe v3
- Pervasive `any` on component props (all extracted session/home components use `}: any)`)
- State variables (`user`, `session`, `userProfile`) are `any` throughout
- `lib/sessions.ts` accepts `supabase: any`
- No generated database types — all Supabase queries return untyped results

### Action items
1. Run `supabase gen types typescript` to generate `lib/database.types.ts`
2. Type all component props with explicit interfaces
3. Create shared types for `User`, `Session`, `Participant` in `lib/types.ts`
4. Eliminate `any` from `lib/sessions.ts` — use generated Supabase client type

---

## 2. Testing

### What it means
Automated tests verify that code works correctly and continues to work after changes.

### What senior engineers do
- Write unit tests for business logic (validation, calculations, transformations)
- Write integration tests for critical user flows (join session, create session, auth)
- Use test doubles (mocks/stubs) for external services (Supabase, push notifications)
- Run tests in CI before merge — no PR merges with failing tests
- Aim for meaningful coverage of critical paths, not vanity coverage numbers

### Why it matters
- Without tests, every change risks breaking existing features
- Manual testing doesn't scale and misses edge cases
- Tests document expected behavior — they're executable specifications

### Current state in Tribe v3
- Zero test files exist
- No testing framework configured
- All verification is manual (build passes, visual check on device)

### Action items
1. Install Vitest + React Testing Library
2. Write unit tests for `lib/sessions.ts` (joinSession validation steps)
3. Write unit tests for `lib/distance.ts`, `lib/utils.ts`
4. Add component tests for critical UI (FilterBar, SessionCard)
5. Add `npm test` to CI pipeline

---

## 3. Error Handling & Observability

### What it means
Errors are caught, reported, and surfaced appropriately — never swallowed silently. Production issues are diagnosable.

### What senior engineers do
- Catch errors at boundaries, log them with context, and show user-friendly messages
- Never use empty `catch {}` blocks — at minimum log the error
- Use structured logging (JSON format with timestamp, context, severity)
- Implement error tracking (Sentry, LogRocket, or similar)
- Add health checks and alerting for critical paths
- Guard `console.log` behind environment checks in production

### Why it matters
- Silent failures are the hardest bugs to diagnose
- Without observability, you only learn about issues when users complain
- Structured logs enable filtering and alerting

### Current state in Tribe v3
- Error boundaries exist (`app/error.tsx`, `app/global-error.tsx`)
- Toast notifications surface errors to users (`showError()`)
- Several empty `catch {}` blocks exist (intentional for non-critical operations like ping)
- Heavy `console.log` usage in FCM code (useful for debugging, noisy in production)
- No structured logging or error tracking service
- No centralized logger utility

### Action items
1. Create `lib/logger.ts` with environment-aware logging (silent in production, verbose in dev)
2. Replace all `console.log`/`console.error` with logger calls
3. Add Sentry or similar for production error tracking
4. Audit and comment all intentional empty `catch {}` blocks

---

## 4. API & Data Layer Design

### What it means
Database access is centralized, consistent, and separated from UI components. Components never construct queries directly.

### What senior engineers do
- Create a Data Access Layer (DAL) — functions that encapsulate all database operations
- Components call DAL functions, never `supabase.from()` directly
- DAL functions handle errors, transform data, and return typed results
- Use React Query or SWR for client-side caching, deduplication, and revalidation
- Validate inputs at system boundaries (API routes, form submissions)

### Why it matters
- Inline Supabase calls scatter business logic across 20+ files
- Changing a table name or query pattern requires editing every file
- No caching means redundant queries on every navigation
- DAL enables testing (mock one layer, test everything above it)

### Current state in Tribe v3
- `lib/sessions.ts` is the only DAL function (joinSession)
- All other database access is inline in page components
- No caching layer — every page load re-fetches everything
- Some N+1 queries exist (AttendanceTracker queries per participant)

### Action items
1. Create `lib/dal/` directory with modules: `sessions.ts`, `users.ts`, `participants.ts`, `chat.ts`
2. Move all `supabase.from()` calls from components into DAL functions
3. Consider adding React Query for caching and background revalidation
4. Fix N+1 query in `AttendanceTracker.tsx`

---

## 5. Security

### What it means
The application protects user data, prevents unauthorized access, and follows the principle of least privilege.

### What senior engineers do
- Authenticate every API route (no unauthenticated endpoints that perform actions)
- Use RLS policies as the primary security layer, not client-side checks
- Never expose service role keys in client-side code
- Validate and sanitize all user inputs
- Use HTTPS everywhere, set security headers
- Audit dependencies for known vulnerabilities (`npm audit`)

### Why it matters
- A single unauthenticated endpoint can compromise the entire application
- Client-side checks can be bypassed — server-side enforcement is mandatory
- Exposed keys grant full database access

### Current state in Tribe v3
- RLS enabled on all tables with appropriate policies
- Auth middleware protects all non-public routes
- Service role keys only used in API routes (server-side)
- `.gitignore` covers `.env*` files
- 4 API routes lack auth guards (`send-attendance-notification`, `notify-nearby`, `geocode`, `generate-calendar`)
- Guest join has no capacity check (unlimited guests possible)
- Chat page (`/session/[id]/chat`) doesn't redirect unauthenticated users (RLS prevents data leakage)

### Action items
1. Add auth guards to all 4 unprotected API routes
2. Add capacity check to guest join flow
3. Add auth redirect to chat page
4. Run `npm audit` and fix any high/critical vulnerabilities
5. Add rate limiting to notification endpoints

---

## 6. Code Organization & Architecture

### What it means
Code is organized into small, focused modules with clear responsibilities. Files are easy to find, understand, and modify.

### What senior engineers do
- Keep files under 300 lines — split larger files into focused components/modules
- Follow single responsibility principle — each file does one thing well
- Group related files by feature (e.g., `components/session/`, `components/home/`)
- Extract shared logic into `lib/` utilities
- Use barrel exports (`index.ts`) for clean import paths
- Maintain consistent naming conventions

### Why it matters
- Large files are hard to review, test, and maintain
- Scattered logic leads to inconsistencies and duplication
- Clear organization helps new developers onboard quickly

### Current state in Tribe v3
- Session detail page extracted into 6 focused components (641 → 6 files)
- Home page extracted into FilterBar + LiveNowSection
- Shared join logic unified in `lib/sessions.ts`
- `app/page.tsx` at 412 lines (over 300 target)
- `app/session/[id]/page.tsx` at 641 lines (modals and handlers still inline)
- Duplicate `compressImage()` function exists in multiple files

### Action items
1. Extract guest modal and invite modal from session detail page
2. Create shared `lib/image.ts` with `compressImage()` utility
3. Further reduce home page by extracting Training Now button and session list
4. Add barrel exports for component directories

---

## 7. Performance

### What it means
The application loads fast, responds instantly to user actions, and doesn't waste resources.

### What senior engineers do
- Lazy load below-the-fold content and heavy dependencies
- Optimize images (compression, appropriate formats, lazy loading)
- Avoid N+1 queries — batch database operations
- Use memoization (`useMemo`, `useCallback`) for expensive computations
- Monitor bundle size and set budgets
- Implement virtualization for long lists

### Why it matters
- Mobile users on slow connections abandon slow apps
- Battery drain from unnecessary re-renders frustrates users
- Large bundles increase time-to-interactive

### Current state in Tribe v3
- Images compressed on upload via `compressImage()` (1200px max, 80% JPEG quality)
- Raw `<img>` tags used (appropriate for static export — `next/image` adds no value)
- `loading="lazy"` on most images
- One N+1 query in `AttendanceTracker.tsx`
- Bundle sizes reasonable (largest chunk ~216KB)
- No list virtualization (session lists could grow large)

### Action items
1. Fix N+1 query in AttendanceTracker
2. Add virtualization for session lists if they exceed ~50 items
3. Lazy load map component (Leaflet is heavy)
4. Audit and remove unused dependencies

---

## 8. Code Review & Quality Gates

### What it means
Every code change is reviewed before merge, and automated checks enforce standards.

### What senior engineers do
- Require PR reviews before merging to main
- Run linting, type checking, and tests in CI
- Use pre-commit hooks for formatting and lint
- Block merges on failing checks
- Review for correctness, security, performance, and maintainability

### Why it matters
- Code review catches bugs, security issues, and design problems early
- Automated gates prevent regressions
- Consistent standards reduce cognitive load

### Current state in Tribe v3
- No CI/CD pipeline configured
- No pre-commit hooks
- All pushes go directly to main
- ESLint configured but not enforced in CI
- TypeScript strict mode not verified

### Action items
1. Set up GitHub Actions for CI (lint, typecheck, build, test)
2. Add pre-commit hooks via Husky (lint-staged)
3. Require PR reviews before merge to main
4. Add branch protection rules

---

## 9. Documentation

### What it means
Code is self-documenting through clear naming and structure. Complex decisions are explained in docs, not comments.

### What senior engineers do
- Write clear function/variable names that explain intent
- Document architectural decisions in ADRs (Architecture Decision Records)
- Keep README and CLAUDE.md up to date
- Add JSDoc comments only for non-obvious public APIs
- Maintain a changelog for significant changes

### Why it matters
- Documentation reduces onboarding time
- ADRs prevent re-litigating past decisions
- Clear naming eliminates the need for most comments

### Current state in Tribe v3
- `CLAUDE.md` provides good project overview and patterns
- `CONVENTIONS.md` documents UI spacing patterns
- No ADRs for architectural decisions
- No changelog
- Code is generally self-documenting with clear naming

### Action items
1. Keep `CLAUDE.md` and `CONVENTIONS.md` updated as patterns evolve
2. Document significant architectural decisions (e.g., why static export, why Capacitor)
3. Add inline documentation for complex business logic (join validation steps)

---

## 10. Deployment & DevOps

### What it means
Deployments are automated, reproducible, and reversible. Infrastructure is defined as code.

### What senior engineers do
- Automate deployments via CI/CD (never deploy manually)
- Use environment-specific configuration (dev/staging/production)
- Implement health checks and monitoring
- Have a rollback strategy for failed deployments
- Use preview deployments for PRs

### Why it matters
- Manual deployments are error-prone and unreproducible
- Without monitoring, you don't know when things break
- Without rollback, a bad deploy requires emergency fixes under pressure

### Current state in Tribe v3
- Deployed via Vercel (automatic on push to main)
- Environment variables managed in Vercel dashboard
- No staging environment
- No health checks or monitoring (beyond Vercel's built-in)
- Capacitor builds are manual (`npx cap sync`, Xcode build)

### Action items
1. Set up a staging branch/environment for pre-production testing
2. Add health check endpoint
3. Automate Capacitor builds with Fastlane or similar
4. Set up uptime monitoring (e.g., Vercel's built-in or UptimeRobot)

---

## Priority Ranking

Items ordered by impact and urgency for a pre-launch / early-launch product:

| Priority | Area | Action | Effort | Impact |
|----------|------|--------|--------|--------|
| 1 | Security | Auth guards on 4 unprotected API routes | 30 min | Critical |
| 2 | Security | Guest join capacity check | 15 min | High |
| 3 | Error Handling | Create `lib/logger.ts`, replace console.log | 1 hr | High |
| 4 | Type Safety | Generate Supabase DB types | 30 min | High |
| 5 | Type Safety | Type component props (eliminate `any`) | 3 hr | High |
| 6 | Data Layer | Create `lib/dal/` with typed DAL functions | 4 hr | High |
| 7 | Performance | Fix N+1 query in AttendanceTracker | 15 min | Medium |
| 8 | Code Org | Extract remaining inline modals/handlers | 2 hr | Medium |
| 9 | Testing | Install Vitest, write tests for `lib/sessions.ts` | 2 hr | Medium |
| 10 | DevOps | Set up GitHub Actions CI | 1 hr | Medium |
| 11 | Code Review | Branch protection + PR reviews | 30 min | Medium |
| 12 | Security | Chat page auth redirect | 10 min | Low |
| 13 | Code Org | Deduplicate `compressImage()` | 15 min | Low |
| 14 | Testing | Component tests for critical UI | 3 hr | Low |
| 15 | DevOps | Staging environment | 1 hr | Low |
