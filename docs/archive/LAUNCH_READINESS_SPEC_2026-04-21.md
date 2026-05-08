# Tribe v3 — Launch Readiness Spec Sheet

**Date:** 2026-04-21 (revised: 100% free tooling)
**Scope:** Everything that must be true before flipping the soft-launch switch this week.
**Grade progression:** B− (baseline audit) → B+ (current, after P0+P1 shipped) → **A− (target after this sheet)**.

This document has two parts:

1. **Claude Code tasks** — work that goes inside the repo. Paste each prompt into Claude Code verbatim.
2. **Dashboard tasks** — work that Al does in browser dashboards. Not a Claude Code job.

**Tooling philosophy:** Every tool listed below has a free tier that covers soft-launch scale (50–500 users). Zero subscription costs until Tribe is generating meaningful revenue. Specifically:

| Capability          | Tool                            | Free tier covers                          |
| ------------------- | ------------------------------- | ----------------------------------------- |
| Error tracking      | **PostHog** (already installed) | 1,000,000 events/month free forever       |
| Uptime monitoring   | **UptimeRobot**                 | 50 monitors, 5-min interval, forever free |
| Server logs         | **Vercel built-in Logs**        | Included in your Vercel plan (free Hobby) |
| Email delivery      | **Resend** (already installed)  | 3,000 emails/month, 100/day free          |
| Database metrics    | **Supabase dashboard**          | Included in the Supabase free tier        |
| Analytics / funnels | **PostHog** (already installed) | Same 1M events bucket as above            |

Total monthly cost for this launch stack: **$0**.

Do the tasks in order. Total effort: ~4 hours of focused work.

---

## Part 1 — Claude Code tasks

### LR-01 · Wire PostHog exception tracking into frontend + API + webhooks

- **Severity:** Blocker
- **Why this blocks launch:** Solo operator running payment flows. Today, if a webhook fails or a cron silently dies, you'll find out only when a user complains. PostHog exception tracking changes that to "notification within minutes."
- **Why PostHog and not Sentry:** PostHog is already installed in this repo and has error tracking as a first-class feature. Using the same tool for analytics and errors means you can jump from "funnel drop" to "the errors that caused it" in one dashboard. Free tier: 1M events/month, which is orders of magnitude more than you'll see this year.
- **Effort:** S (45–60 min)

```
TASK — LR-01 · PostHog exception tracking.

Working on tribe-v3. Goal: wire PostHog's exception capture into the
frontend, server API routes, and webhook handlers. PostHog is already
installed (lib/posthog.ts + PostHogProvider), so this is extending an
existing integration, not adding a new vendor.

Step 1 — Verify PostHog client is configured for error tracking:
  Open lib/posthog.ts. Confirm the init call includes:
    capture_exceptions: true
  If not present, add it. Example:
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      capture_exceptions: true,
      autocapture: true,
    });

Step 2 — Add an error boundary helper for server-side capture.
  Create lib/captureError.ts:

    import { PostHog } from 'posthog-node';

    const server = process.env.NEXT_PUBLIC_POSTHOG_KEY
      ? new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
          host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
          flushAt: 1, // send immediately
          flushInterval: 0,
        })
      : null;

    export async function captureServerError(
      err: unknown,
      context: Record<string, unknown> = {}
    ) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.error('[captureServerError]', message, context);
      if (!server) return;
      try {
        server.captureException(err instanceof Error ? err : new Error(message), context.userId as string | undefined, {
          ...context,
          error_stack: stack,
          source: 'server',
          release: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
        });
        await server.flush();
      } catch (captureErr) {
        console.error('[captureServerError] failed to send to PostHog', captureErr);
      }
    }

  Note: if posthog-node isn't in package.json, install it:
    npm install posthog-node

Step 3 — Add explicit capture in the critical server routes:

  a) app/api/payment/webhook/stripe/route.ts — wrap the handler in a
     try/catch that calls captureServerError(err, { route: 'stripe-webhook',
     event_id: eventId }) on failure. Re-throw or return 500 after capture
     so Stripe retries still happen.

  b) Same treatment for app/api/payment/webhook/wompi/route.ts with
     { route: 'wompi-webhook', transaction_id: ... }.

  c) All app/api/cron/*/route.ts files — capture any uncaught error with
     captureServerError(err, { route: 'cron:<name>' }).

Step 4 — Wire client-side error boundary:
  app/error.tsx and app/global-error.tsx should import posthog-js and
  call posthog.captureException(error) inside the component on mount
  (useEffect). That way React render errors land in PostHog too.

Step 5 — Test:
  In dev, throw new Error('test-posthog-capture') in a temporary route.
  Confirm it appears in PostHog → Activity → Exceptions (or Events, if
  the Exceptions view isn't enabled yet — see D-01 below). Remove the
  test code before committing.

Step 6 — Document in .env.local.example that POSTHOG keys are required
  for error tracking (they're already there for analytics; just add a
  comment clarifying the dual purpose).

Commit: `feat(ops): PostHog exception tracking across frontend + API (LR-01)`
```

---

### LR-02 · Add `/api/health` endpoint

- **Severity:** High
- **Why:** Lets UptimeRobot (free) answer "is the app up?" without simulating a full user session. Also gives you a one-click sanity check during incidents.
- **Effort:** XS (10 min)

```
TASK — LR-02 · Health check endpoint.

Create app/api/health/route.ts. It should:

  - Be publicly accessible (no auth — monitoring services need to hit it).
  - Return 200 with { status: 'ok', db: 'ok', ts: ISO-8601 } on success.
  - Return 503 with { status: 'degraded', db: 'down', ts } if Supabase is
    unreachable.
  - Execute a cheap Supabase query (e.g., select 1 from a small table) with
    a 3-second timeout to check DB reachability.

Do NOT query sensitive tables. Do NOT leak environment info.

Example shape:

  import { NextResponse } from 'next/server';
  import { createClient } from '@/lib/supabase/server';

  export const dynamic = 'force-dynamic';

  export async function GET() {
    const ts = new Date().toISOString();
    try {
      const supabase = await createClient();
      const { error } = await supabase.from('users').select('id').limit(1).maybeSingle();
      if (error) {
        return NextResponse.json({ status: 'degraded', db: 'down', ts }, { status: 503 });
      }
      return NextResponse.json({ status: 'ok', db: 'ok', ts });
    } catch {
      return NextResponse.json({ status: 'degraded', db: 'down', ts }, { status: 503 });
    }
  }

Commit: `feat(ops): add /api/health endpoint (LR-02)`
```

---

### LR-03 · Document secret rotation checklist in the repo

- **Severity:** Medium
- **Why:** The actual rotation is a dashboard task (see Part 2), but the repo needs a persistent reference so the next person knows what to rotate and when.
- **Effort:** XS (10 min)

```
TASK — LR-03 · Secret rotation runbook.

Create docs/SECRETS_ROTATION.md with these sections:

  # Secret rotation runbook

  ## When to rotate
  - Any secret that was ever committed to git (historical incident)
  - Every 90 days for production keys (calendar reminder)
  - Immediately if a contractor with access leaves the project
  - Immediately after a suspected leak or exposure

  ## What to rotate, where, and how

  | Secret | Where stored | Rotation location | Redeploy required? |
  |--------|-------------|-------------------|--------------------|
  | NEXT_PUBLIC_SUPABASE_ANON_KEY | Vercel env | Supabase dashboard → Settings → API | Yes |
  | SUPABASE_SERVICE_ROLE_KEY | Vercel env | Same as above | Yes |
  | STRIPE_SECRET_KEY | Vercel env | Stripe dashboard → Developers → API keys | Yes (Phase 2) |
  | STRIPE_WEBHOOK_SECRET | Vercel env | Stripe dashboard → Developers → Webhooks → Signing secret | Yes (Phase 2) |
  | WOMPI_PRIVATE_KEY | Vercel env | Wompi dashboard → API keys | Yes (Phase 2) |
  | WOMPI_EVENTS_SECRET | Vercel env | Wompi dashboard → Webhooks | Yes (Phase 2) |
  | RESEND_API_KEY | Vercel env | Resend dashboard → API keys | No (restart only) |
  | VAPID keys | Vercel env | Regenerate with `npx web-push generate-vapid-keys` | Yes |
  | CRON_SECRET | Vercel env | Generate with `openssl rand -hex 32` | Yes |
  | WEBHOOK_SECRET | Vercel env | Generate with `openssl rand -hex 32` | Yes |
  | FIREBASE_SERVICE_ACCOUNT_KEY | Vercel env | Firebase console → Service accounts → Generate new key | Yes |
  | NEXT_PUBLIC_POSTHOG_KEY | Vercel env | PostHog → Settings → Project (reset) | Yes |

  ## Step-by-step
  1. Generate new value in the source system (see table).
  2. Update Vercel project env var (Production environment).
  3. Trigger a redeploy: `vercel --prod` or push a no-op commit.
  4. Update .env.local on each developer machine.
  5. If the old key was exposed, revoke it in the source system AFTER
     verifying the new one works.

Commit: `docs(ops): add secrets rotation runbook (LR-03)`
```

---

### LR-04 · PostHog funnel-critical event audit

- **Severity:** Medium
- **Why:** The event taxonomy is already in `lib/analytics.ts` and events fire correctly. What's missing is the funnel visibility. The actual funnel setup happens in PostHog's web UI (Part 2). This task just documents the expected events and makes sure no critical event is missing its call.
- **Effort:** S (30 min)

```
TASK — LR-04 · PostHog funnel-critical event audit.

Goal: verify that every event needed for the three launch funnels is being
fired in the right place. If any are missing, add them.

Funnel 1: Signup
  Required events (in order): signup_started, signup_email_submitted,
  signup_email_verified, onboarding_started, onboarding_completed,
  profile_first_save.

Funnel 2: Session join
  Required events: session_viewed, session_join_clicked,
  session_join_succeeded OR session_join_failed_{full, already_joined,
  auth_required, server_error}.

Funnel 3: Post-session rating
  Required events: rating_modal_shown, rating_submitted,
  rating_submit_failed_{already_reviewed, server_error}.

Step 1 — Open lib/analytics.ts and list every event currently defined.
  Diff against the three funnel lists above. Report which events (if any)
  are missing from the taxonomy.

Step 2 — For each missing event, find the right place in the code to emit
  it (signup → app/auth/, join → hooks/useSessionActions.ts, rating →
  components/PostSessionPrompt.tsx) and add a trackEvent() call with
  appropriate payload.

Step 3 — Run grep to confirm every event in the taxonomy is actually
  called somewhere. Any event defined but never emitted is dead code.

Step 4 — Document the three funnels in docs/ANALYTICS_FUNNELS.md so the
  PostHog dashboard setup (Part 2) has a reference.

Commit: `feat(analytics): audit + complete funnel-critical events (LR-04)`
```

---

### LR-05 · Log successful cron runs, not just failures

- **Severity:** Medium
- **Why:** Per the observability audit — today, if a cron job succeeds it's silent. You can't tell if it actually ran. When a user says "I didn't get my reminder" you'll have no evidence either way. Vercel's built-in log viewer (free) picks up structured console output automatically.
- **Effort:** S (30 min)

```
TASK — LR-05 · Cron run logging.

For every file under app/api/cron/*/route.ts:

  - At the end of the handler, log a structured success line using the
    existing logger (lib/logger.ts). Ensure it supports level: 'info',
    adding that branch if needed:
      logInfo({ action: 'cron_complete', route: '<name>', count: N,
                duration_ms: X });

  - On failure, call captureServerError from LR-01 so PostHog picks up
    the exception, AND log via logError so Vercel Logs show it too.

  - Return a structured JSON response so Vercel Cron logs show something
    useful: { ok: true, route: '<name>', processed: N } on success.

  - Wrap the entire body in try/catch so uncaught errors always flow
    through captureServerError. Return 500 on catch so Vercel doesn't
    think the cron passed.

Cron routes to update (get the exact list with: ls app/api/cron/):
  - app/api/cron/engagement/route.ts
  - app/api/cron/session-reminders/route.ts
  - app/api/cron/weekly/route.ts
  - (and any others under app/api/cron/*)

After this, PostHog (LR-01) picks up failures automatically, and success
logs are visible in Vercel → Logs filtered by "cron_complete".

Commit: `feat(ops): structured cron success/failure logging (LR-05)`
```

---

### LR-06 · Rollback runbook

- **Severity:** Medium
- **Why:** If a deploy breaks production at 10pm on a Tuesday you don't want to be reading Vercel docs for the first time.
- **Effort:** XS (15 min)

```
TASK — LR-06 · Incident rollback runbook.

Create docs/INCIDENT_RESPONSE.md with these sections:

  # Incident response

  ## "The app is down"
  1. Check https://tribe-v3.vercel.app/api/health. If it returns 503,
     DB is down.
  2. Check Vercel dashboard → Deployments → is latest deploy green?
  3. Check Supabase dashboard → Project status.
  4. Check PostHog → Activity → Exceptions for recent error spike.

  ## "I just deployed something and it broke"
  1. Vercel dashboard → Deployments → find the last known-good deploy.
  2. Click the three dots → "Promote to Production" on that deployment.
  3. This rolls back in <30 seconds. No code revert needed.
  4. Then fix the issue locally, push a fix commit, and redeploy.

  ## "Payments aren't working" (Phase 2 onwards)
  1. Check PostHog for exceptions tagged route: 'stripe-webhook' or
     'wompi-webhook'.
  2. Check Stripe dashboard → Developers → Webhooks → failures.
  3. Check Wompi dashboard → Eventos / Webhooks → last 10 events.
  4. Query: SELECT * FROM payments WHERE status = 'pending'
     ORDER BY created_at DESC LIMIT 20;

  ## "Users can't sign up"
  1. Check PostHog for exceptions in the signup flow.
  2. Check Supabase → Authentication → is the provider (email / Google)
     enabled?
  3. Check rate limit in lib/rate-limit.ts — is 5/min too tight?

  ## "Something looks off but I can't tell what"
  1. Vercel → Logs → filter by level:error in the last 1 hour.
  2. PostHog → Activity → Exceptions, sorted by most recent.
  3. PostHog → Insights → the three launch funnels — did drop-off
     jump at a specific step?

  ## Communication template (if you need to tell users)
  (draft a short template for a quick email / social post)

Commit: `docs(ops): incident response runbook (LR-06)`
```

---

## Part 2 — Dashboard tasks (you do these, not Claude Code)

These happen in browser tabs, not in code. Budget: ~90 minutes total.

### D-01 · Enable PostHog Exceptions view + Slack/email alerts

1. Log into PostHog (you already have an account — the app is sending events).
2. In the left sidebar, look for **Activity → Exceptions**. If you don't see it, go to **Settings → Project → Feature preview** and enable "Error Tracking." It's free, just not always on by default.
3. Once enabled, PostHog will auto-group exceptions by fingerprint and show stack traces, affected users, and trend over time.
4. Set up an **alert**: Insights → New insight → Trends → Event: `$exception` → Filter by hour → **Create alert** when count > 10 in 1 hour, notify your email. This catches error spikes within minutes.
5. Optional but useful: **Settings → Project → Integrations → Slack**. If you have a Slack workspace, pipe error alerts there. Free.
6. After the app has been live for 24 hours, check this view daily for the first two weeks.

### D-02 · Rotate all production secrets

Do this **before** exposing the app to real users. Follow the runbook from LR-03. Order matters:

1. **Supabase keys** — Dashboard → Settings → API → regenerate anon + service role. Update `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel (Production). Redeploy.
2. **Resend** — Dashboard → API Keys → create new → update `RESEND_API_KEY` in Vercel → delete old key.
3. **Firebase service account** — Firebase console → Project Settings → Service accounts → Generate new private key → update `FIREBASE_SERVICE_ACCOUNT_KEY` in Vercel (paste full JSON).
4. **VAPID keys** — Run locally: `npx web-push generate-vapid-keys`. Copy the two values into Vercel. **Important:** this will invalidate all existing push subscriptions. Users will re-subscribe on next visit, which is fine pre-launch.
5. **CRON_SECRET, WEBHOOK_SECRET** — Generate each with `openssl rand -hex 32`. Update in Vercel.
6. **Google Maps** — In Cloud Console, create new API key with Places API enabled, restrict to your domain, update both `GOOGLE_MAPS_SERVER_KEY` and `NEXT_PUBLIC_GOOGLE_PLACES_KEY` in Vercel.
7. **PostHog** — Skip rotation for now (low blast radius — PostHog project keys don't grant database access). Rotate on next scheduled cycle.
8. After each update, trigger a Vercel redeploy and verify `/api/health` still returns 200.

### D-03 · Configure UptimeRobot on `/api/health`

1. Sign up at [uptimerobot.com](https://uptimerobot.com) (free tier — 50 monitors, 5-min interval, email alerts).
2. **+ Add New Monitor** → Monitor Type: HTTP(s) → URL: `https://tribe-v3.vercel.app/api/health` → Monitoring Interval: 5 minutes → Name: `Tribe production`.
3. Add your email as the alert contact.
4. Save. UptimeRobot will now ping every 5 min and email you if it fails for more than one interval.
5. Optional: add a second monitor for `https://tribe-v3.vercel.app/` (home page) so you know if the Next.js build itself is healthy independent of the DB.

### D-04 · Configure Wompi and Stripe webhooks

**See the separate file `PAYMENT_PORTAL_SETUP_GUIDE.md` for the full walkthrough.**

**Recommendation:** skip this for the Phase 1 soft launch. Launch cash-only per the monetization plan (0% fee, Nequi/cash instructions, manual confirmation). Come back to this section in Week 5–8 when you activate Phase 2 digital payments.

### D-05 · Set up the three PostHog funnels

After LR-04 has shipped and you've verified events are firing:

1. Log into PostHog. Go to **Insights → New insight → Funnel**.
2. Build each of the three funnels from the event lists in LR-04 (`docs/ANALYTICS_FUNNELS.md` when it's written).
3. Save each funnel. Pin them to your dashboard.
4. Also create a **Trends** chart for: Daily Active Users, Sessions Created Per Day, Bookings Per Day. Pin those too.
5. Once you have 50+ users, revisit these dashboards daily for the first two weeks.

### D-06 · Vercel log viewer familiarity pass

1. Open Vercel → your project → **Logs**.
2. Run a quick filter experiment: set level to `error`, time range to last 24 hours. Familiarize yourself with the query syntax.
3. Pin this tab during the soft launch. Between PostHog and Vercel Logs, you have complete runtime visibility — no separate paid service needed.
4. Bookmark the filtered view so you can jump to it in 2 clicks during an incident.

### D-07 · Quick manual smoke test

Hit every critical flow once, ideally on a real mobile device:

- Sign up with a fresh email. Complete onboarding. Reach home feed.
- Create a free session.
- Log in as a second account, view and join that session.
- Mark the session "complete" (creator side). Rate it from the participant account. Try to rate it a second time — confirm duplicate is blocked with a clear message.
- Send a DM between the two accounts.
- Submit a bulletin post from the non-admin. Switch to admin account, confirm you see it in the moderation queue.
- Test mobile bottom nav, safe-area insets on home indicator.
- Open `/api/health` — should return 200 with `ok`.

If all of that works, launch.

---

## What's NOT in this spec

Explicit non-goals for this week — don't let yourself get pulled into any of these:

- Paid observability (Sentry, Datadog, Logtail). PostHog + Vercel Logs cover soft launch.
- Full Server Components migration (QUAL-07 from the earlier audit) — post-launch.
- Reorganize `components/` folder — post-launch.
- Pen test — three months post-launch when the product has stabilized.
- Feature-flag infrastructure — post-launch.
- Accessibility specialist audit — post-launch.
- BIMI email logo — when volume justifies.

Everything above is in the Notion **Deferred Features** database already, so it won't get lost.

---

## Suggested sequencing for the week

**Tuesday / Wednesday (2–3 hours of Claude Code work):** LR-01 → LR-02 → LR-04 → LR-05 → LR-03 → LR-06. Each commits independently.

**Thursday (90 minutes of dashboard work):** D-01 (PostHog Exceptions) → D-02 (rotate secrets) → D-03 (UptimeRobot) → D-05 (PostHog funnels) → D-06 (Vercel Logs familiarity).

**Thursday evening or Friday morning:** D-04 reviewed and deferred to Phase 2 (unless you're turning on digital payments this launch — usually not). Run D-07 manual smoke test.

**Friday afternoon:** Launch.

**Total cost:** $0 in new subscriptions. The whole observability stack runs on free tiers that cover you well past 500 users.
