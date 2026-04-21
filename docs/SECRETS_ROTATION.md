# Secret rotation runbook

**Owner:** Al
**Last reviewed:** 2026-04-21 (LR-03 launch readiness)

This document is the single source of truth for rotating production secrets
in Tribe v3. The actual rotation happens in each vendor's dashboard — this
file tells you what to rotate, where, and in what order so you don't brick
production.

---

## When to rotate

- **Immediately** if a secret was ever committed to git, even briefly.
- **Immediately** if a contractor or teammate with access leaves the project.
- **Immediately** after a suspected leak, compromise, or unexplained
  anomaly in logs.
- **Every 90 days** for production keys as a calendar hygiene rule. Add a
  recurring reminder.

---

## What to rotate, where, and how

Columns:

- **Secret**: env var name as it appears in Vercel + `.env.local`.
- **Where stored**: the Vercel environment(s) it must be updated in.
- **Rotation location**: the vendor dashboard path where you generate the
  new value.
- **Redeploy required?**: whether you need to trigger a Vercel redeploy
  (`vercel --prod` or a no-op commit) after updating the env var. Most
  require yes because Next.js reads env vars at build time.

| Secret                                   | Where stored                              | Rotation location                                                                                                   | Redeploy required?                                              |
| ---------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`               | Vercel env (All envs)                     | Supabase → Settings → API → Project URL                                                                             | Yes (rare — only when moving projects)                          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`          | Vercel env (All envs)                     | Supabase → Settings → API → anon key → regenerate                                                                   | Yes                                                             |
| `SUPABASE_SERVICE_ROLE_KEY`              | Vercel env (Production + Preview)         | Same as above — service role key → regenerate                                                                       | Yes                                                             |
| `STRIPE_SECRET_KEY`                      | Vercel env (Production)                   | Stripe → Developers → API keys → rotate restricted key                                                              | Yes                                                             |
| `STRIPE_WEBHOOK_SECRET`                  | Vercel env (Production)                   | Stripe → Developers → Webhooks → pick endpoint → Signing secret → reveal/rotate                                     | Yes                                                             |
| `WOMPI_PUBLIC_KEY`                       | Vercel env (Production)                   | Wompi → Developers → API keys → Public key                                                                          | Yes                                                             |
| `WOMPI_PRIVATE_KEY`                      | Vercel env (Production)                   | Wompi → Developers → API keys → Private key → regenerate                                                            | Yes                                                             |
| `WOMPI_EVENTS_SECRET`                    | Vercel env (Production)                   | Wompi → Webhooks → copy secret (rotates when you update the webhook endpoint)                                       | Yes                                                             |
| `WOMPI_INTEGRITY_SECRET`                 | Vercel env (Production)                   | Wompi → Developers → Integrity (signatures)                                                                         | Yes                                                             |
| `RESEND_API_KEY`                         | Vercel env (Production)                   | Resend → API Keys → create new → delete old                                                                         | No (hot reload — next function invocation picks up new key)     |
| `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` | Vercel env (Production)                   | Generate: `npx web-push generate-vapid-keys`                                                                        | Yes — **also invalidates all existing push subscriptions**      |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`           | Vercel env (Production)                   | Must equal `VAPID_PUBLIC_KEY` from the same keypair                                                                 | Yes                                                             |
| `CRON_SECRET`                            | Vercel env (Production)                   | Generate: `openssl rand -hex 32`                                                                                    | Yes                                                             |
| `WEBHOOK_SECRET`                         | Vercel env (Production)                   | Generate: `openssl rand -hex 32`                                                                                    | Yes — also update Supabase webhook config to send the new value |
| `FIREBASE_SERVICE_ACCOUNT_KEY`           | Vercel env (Production)                   | Firebase Console → Project Settings → Service accounts → Generate new private key → paste full JSON                 | Yes                                                             |
| `GOOGLE_MAPS_SERVER_KEY`                 | Vercel env (Production)                   | GCP Console → APIs & Services → Credentials → create key → restrict to Places API + server IP allowlist             | Yes                                                             |
| `NEXT_PUBLIC_GOOGLE_PLACES_KEY`          | Vercel env (All envs)                     | GCP Console → Credentials → create key → restrict to Places API + HTTP referrer (tribe-v3.vercel.app + your domain) | Yes                                                             |
| `EVENTBRITE_API_KEY`                     | Vercel env (Production)                   | Eventbrite → Developer → Private token → regenerate                                                                 | Yes                                                             |
| `POSTHOG_PROJECT_API_KEY`                | Vercel env (Production)                   | PostHog → Project Settings → Project API key — shown once, rotate by resetting project                              | Yes                                                             |
| `SENTRY_AUTH_TOKEN`                      | Vercel env (Production — build time only) | Sentry → User Auth Tokens → create → scope: `project:releases`                                                      | Yes (source map upload)                                         |
| `SENTRY_DSN`                             | Vercel env (All envs)                     | Sentry → Project → Settings → Client Keys (DSN)                                                                     | Yes                                                             |

If a secret isn't in this table and you think it should be, add it in the
same PR that introduces the feature that uses it.

---

## Step-by-step

1. **Generate** the new value in the source system (see table). Leave the
   old key active for now.
2. **Update Vercel** project env var in the correct Environment scope
   (Production, Preview, Development). Click Save.
3. **Redeploy** if the table says yes. Use `vercel --prod` or push a
   no-op commit to main.
4. **Verify** by hitting the affected surface:
   - Supabase keys → `/api/health` returns 200
   - Payment keys → fire a Stripe/Wompi test event, confirm webhook 200
   - Firebase key → trigger a push notification from `/api/notifications/send`
   - VAPID → open the app in an incognito window, grant notification
     permission, send a test push
5. **Update `.env.local`** on every developer machine. Store in a shared
   password manager (1Password / Bitwarden), not in chat.
6. **Revoke** the old key in the source system AFTER step 4 confirms the
   new key works in production. **Don't skip this** — leaving the old key
   active for "just in case" defeats the rotation.

---

## Emergency rotation (leak scenario)

If a secret is actively compromised (e.g., leaked in a Slack channel,
pushed to a public repo, or appearing in Sentry events):

1. **Immediately** revoke the old key in the vendor dashboard. Service
   outage for ~30 seconds is acceptable; continued compromise is not.
2. Generate and deploy the new key as above.
3. Check vendor logs for any suspicious activity in the window between
   leak and revocation (Stripe has audit logs; Supabase has query logs
   behind the service-role key).
4. If there's evidence of misuse, file an incident postmortem using
   `docs/INCIDENT_RESPONSE.md`.

---

## What NOT to do

- **Never** commit a secret to git, even in `.env.local`. `.gitignore`
  already covers `.env.local`; don't override it.
- **Never** put a secret in a client-side file (anything under `app/`
  that's reachable by a `'use client'` component) unless it starts with
  `NEXT_PUBLIC_` — those are broadcast to every visitor's browser.
- **Never** rotate a payment key while checkout traffic is in flight
  unless the leak is actively being exploited. Schedule rotations for
  low-traffic windows (Colombia local: 3–5 AM) where possible.
- **Never** reuse the same value across environments — Production and
  Preview should have distinct Supabase projects, Stripe accounts, Wompi
  accounts, etc. If today they share, that's a separate ticket.
