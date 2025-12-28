# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tribe is a mobile-first PWA for connecting athletes to train together. Users can create/join training sessions, chat with participants, and find workout partners nearby. The app supports English and Spanish localization and targets the Colombia/Medellín market.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production (static export)
npm run lint     # Run ESLint
npm start        # Start production server
```

## Tech Stack

- **Framework**: Next.js 16 with App Router (static export via `output: 'export'`)
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

**Toast Notifications**
- Use helpers from `@/lib/toast`: `showSuccess()`, `showError()`, `showInfo()`

### Database Schema

Core tables in `supabase/schema.sql`:
- `users` - Profiles linked to Supabase Auth
- `sessions` - Training sessions with location, sport, date/time
- `session_participants` - Join table with status (pending/confirmed)
- `match_requests` - Request system for curated sessions

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

## Static Export Notes

The app uses `output: 'export'` in next.config.ts for static site generation. This means:
- No Server Components (all pages use `'use client'`)
- API routes only work in development; production uses Supabase Edge Functions
- Images are unoptimized (`images: { unoptimized: true }`)
