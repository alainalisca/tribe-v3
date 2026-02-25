# Tribe v3

Never Train Alone. A peer-to-peer fitness app connecting athletes in Medellin, Colombia.

## Tech Stack

- **Frontend**: Next.js 16, React 18, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Realtime)
- **Mobile**: Capacitor (iOS + Android)
- **Hosting**: Vercel (static export)
- **Push**: Firebase Cloud Messaging + APNs
- **Analytics**: PostHog
- **Email**: Resend
- **Maps**: Leaflet / React-Leaflet

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Fill in the values (see Environment Variables below)

# Run development server
npm run dev
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side only) |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog analytics key |
| `NEXT_PUBLIC_POSTHOG_HOST` | PostHog host URL |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key |
| `VAPID_EMAIL` | VAPID contact email |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Firebase service account JSON |
| `RESEND_API_KEY` | Resend email API key |
| `CRON_SECRET` | Secret for cron job endpoints |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build (static export) |
| `npm test` | Run tests (Vitest) |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with auto-fix |
| `npm run format` | Format with Prettier |
| `npm run format:check` | Check formatting |

## Architecture

```
app/                  # Next.js pages and API routes
components/           # Reusable React components
  session/            # Session detail sub-components
  home/               # Home page sub-components
  admin/              # Admin dashboard sub-components
hooks/                # Custom React hooks
lib/                  # Utilities, types, helpers
  dal/                # Data Access Layer (typed Supabase functions)
  supabase/           # Supabase client setup
  test-utils/         # Test mocks and helpers
contexts/             # React Context providers (Theme, Language)
supabase/             # Database schema, migrations, Edge Functions
messages/             # i18n JSON files (en.json, es.json)
.claude/skills/       # Engineering enforcement skills
```

### Key Patterns

- **Supabase Client**: `createClient()` from `@/lib/supabase/client` (client-side) or `@/lib/supabase/server` (server-side)
- **Translations**: `useLanguage()` hook with `t('key')` or inline `language === 'es' ? ... : ...`
- **Theming**: `useTheme()` hook with class-based dark mode
- **Toasts**: `showSuccess()`, `showError()`, `showInfo()` from `@/lib/toast`
- **DAL**: Typed database functions in `lib/dal/` instead of inline Supabase queries
- **Error Messages**: `getErrorMessage(error, context, language)` from `@/lib/errorMessages`

### Session Join Policies

- `open` — Anyone can join immediately
- `curated` — Host reviews and approves requests
- `invite_only` — Private, requires direct invitation

See `engineering-standards.md` for code quality standards.
See `CONVENTIONS.md` for UI spacing conventions.
See `CHANGELOG.md` for version history.
