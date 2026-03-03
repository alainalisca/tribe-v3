# Architecture Decision Records

## ADR-001: Native OAuth for Mobile

- **Date:** 2026-03
- **Status:** Implemented
- **Context:** Supabase `signInWithOAuth` uses a redirect flow that breaks in Capacitor's WebView because the WebView cannot handle OAuth redirects back to the app properly.
- **Decision:** Use native plugins (`@codetrix-studio/capacitor-google-auth`, `@capacitor-community/apple-sign-in`) with `signInWithIdToken` on native platforms, keep redirect flow on web.
- **Consequences:** Requires maintaining two auth paths (native vs web). Plugin compatibility must be verified on Capacitor upgrades. The auth page (`app/auth/page.tsx`) detects the platform via `Capacitor.getPlatform()` and switches flows accordingly.

## ADR-002: Static Export with Capacitor

- **Date:** 2026-01
- **Status:** Implemented
- **Context:** Capacitor requires static files to bundle into native apps. Next.js SSR/SSG with server-side features won't work in a Capacitor WebView.
- **Decision:** Use `output: 'export'` in `next.config.ts` for static site generation. All pages use `'use client'`. API routes work only in development; production uses Supabase Edge Functions or client-side logic.
- **Consequences:** No Server Components or server-side API routes in production. Server-side logic must use Supabase directly from the client. Calendar export was converted from an API route to client-side ICS generation (`lib/calendar.ts`).

## ADR-003: Bilingual Architecture (EN/ES)

- **Date:** 2026-02
- **Status:** Implemented
- **Context:** App targets Medellín, Colombia — users speak both English and Spanish. An i18n framework (next-intl, react-i18next) adds complexity and bundle size for just two languages.
- **Decision:** Client-side language toggle with translation objects in each component. A global `LanguageContext` provides `language` and `t()` helper. Translation keys live in `lib/translations.ts` and inline `const t = language === 'es' ? { ... } : { ... }` objects.
- **Consequences:** Translation maintenance is manual. Each new feature must include both languages. No server-side locale detection. The `useLanguage()` hook persists the preference to localStorage.

## ADR-004: Data Access Layer Pattern

- **Date:** 2026-03
- **Status:** In Progress
- **Context:** Inline Supabase queries in components make code harder to test, reuse, and maintain. Queries are duplicated across pages.
- **Decision:** Migrate database operations to `lib/dal/` modules that return typed `DalResult<T>` objects. Components import from `@/lib/dal` instead of calling `supabase.from()` directly.
- **Consequences:** New features should use DAL functions. Existing inline queries are being migrated incrementally. Test files can mock DAL functions instead of mocking the full Supabase client.

## ADR-005: In-Memory Rate Limiting

- **Date:** 2026-02
- **Status:** Implemented
- **Context:** API routes need burst protection against abuse (signup spam, notification flooding). Redis adds infrastructure cost and complexity for a beta app.
- **Decision:** Use an in-memory `Map`-based rate limiter (`lib/rate-limit.ts`) with configurable windows and limits per IP.
- **Consequences:** Rate limits are per-instance only — not shared across Vercel serverless cold starts. Good enough for burst protection during beta. Will need Redis/Upstash if strict rate limiting is required at scale.
