# Incident response

**Owner:** Al
**Last reviewed:** 2026-04-21 (LR-06 launch readiness)

When production is broken, you're not going to read docs cover to cover —
you're going to scan for the scenario that matches the symptom and follow
the steps. This file is organized that way.

Critical URLs, keep handy:

- Production: https://tribe-v3.vercel.app
- Health check: https://tribe-v3.vercel.app/api/health/
- Vercel dashboard: https://vercel.com/alain-aliscas-projects/tribe-v3
- Supabase dashboard: https://supabase.com/dashboard/project/<project-id>
- PostHog exceptions: https://app.posthog.com → Activity → Exceptions
- Vercel Logs: https://vercel.com/alain-aliscas-projects/tribe-v3/logs
- Stripe: https://dashboard.stripe.com/webhooks
- Wompi: https://comercios.wompi.co/ → Webhooks

---

## "The app is down"

Symptom: users report blank pages, 500s, or indefinite loading.

1. Hit `/api/health/` in a browser or `curl https://tribe-v3.vercel.app/api/health/`.
   Note the trailing slash — without it you get a 308 redirect (Next.js
   `trailingSlash: true`). UptimeRobot should be configured with the
   trailing-slash URL so it sees the 200 directly.
   - **200** with `{status:'ok',db:'ok'}` → the app is up; the problem is
     likely client-side (CDN cache, user network). Jump to step 4.
   - **503** with `{status:'degraded',db:'down'}` → Supabase is unreachable
     from the serverless runtime. Jump to step 3.
   - **Timeout / connection refused** → the whole Vercel deploy is down or
     the domain is misrouted. Jump to step 2.

2. **Vercel deploy check**:
   - Vercel dashboard → Deployments → is the latest Production deploy green?
   - If the latest is a red deploy, the previous deploy is still serving
     (Vercel only promotes on successful build). But a partial outage
     during deploy rollout can happen — proceed to "I just deployed
     something and it broke" below.

3. **Supabase status**:
   - Supabase dashboard → Project → top of page shows status dot.
   - https://status.supabase.com for platform-wide incidents.
   - If only THIS project is down, check: Settings → Database → is it
     paused? (Free tier auto-pauses after inactivity.) Resume it.

4. **Client-side issues**:
   - Check PostHog → Activity → Exceptions for a spike in the last 15 min.
   - Check browser console: CSP violations? Third-party script (PostHog,
     Maps, Leaflet CDN) failing? Network tab for failed requests.
   - Your CDN region (Vercel edge) might be misbehaving — check from a
     different network (mobile data, VPN).

---

## "I just deployed something and it broke"

This is the most common incident type and has the fastest fix.

1. **Don't revert git.** Revert in Vercel instead — it's 30 seconds vs.
   5 minutes of rebuild time.
2. Vercel dashboard → Deployments → find the previous known-good deploy
   (the one right before the breaking one — filter by branch=main and
   environment=Production).
3. Click the `⋮` menu on that deploy → **Promote to Production**.
4. Confirm the promotion. The prod alias (tribe-v3.vercel.app) flips to
   the old deploy in under a minute.
5. **Now** debug locally:
   - `git checkout` the breaking commit
   - Reproduce
   - Fix
   - Push a new commit — this triggers a new deploy that either succeeds
     (problem fixed) or fails build (you caught it pre-prod).
6. After the fix deploys clean, optionally promote that one to prod
   manually or let Vercel auto-promote.

Never try to hot-fix via the Vercel UI or directly SSH anywhere — that
path doesn't exist in this stack.

---

## "Payments aren't working"

Symptoms: users say "I paid but the session isn't booked", or PostHog
Exceptions shows `stripe-webhook` / `wompi-webhook` events.

1. **PostHog Exceptions first**: Activity → Exceptions, filter by
   property `route = stripe-webhook` or `route = wompi-webhook`. A
   recent spike tells you whether the problem is signature verification,
   Supabase write, or the `finalize_payment` RPC.
2. **Stripe dashboard** → Developers → Webhooks → pick the production
   endpoint → look at the last 20 events. Red X's here mean our endpoint
   returned non-2xx. Click one to see the exact response body.
3. **Wompi dashboard** → Eventos/Webhooks → last 10 events. Wompi shows
   3 attempts per event; if all 3 failed, the transaction is stuck in
   `pending` on our side.
4. **Supabase query for stuck payments**:
   ```sql
   SELECT id, gateway_payment_id, gateway, status, amount_cents, created_at
   FROM payments
   WHERE status = 'pending'
     AND created_at < NOW() - INTERVAL '15 minutes'
   ORDER BY created_at DESC
   LIMIT 20;
   ```
   Any rows here are orphaned intents — either the user abandoned checkout
   or the webhook never fired. Cross-reference gateway_payment_id with
   the gateway dashboard.
5. **`finalize_payment` RPC** (migration 047): if the RPC itself is
   throwing, look at Supabase → Database → Functions → run it manually
   with a known good payment id in the SQL editor. The RPC body has an
   `EXCEPTION WHEN OTHERS` clause that returns `{success:false,error,code}` —
   that's what the webhook handler logs to PostHog.

---

## "Users can't sign up"

1. **PostHog Exceptions** → filter by `route = /api/auth/signup`. Any 5xx spike?
2. **Supabase** → Authentication → Providers → is email / Google enabled?
   Accidentally disabling a provider in the dashboard is a surprisingly
   common incident cause.
3. **Rate limits** (LR-05): `lib/rate-limit.ts` caps signup at 5/min per
   IP via the `rate_limits` table. If the table has a bad index or got
   bloated, check recent row counts:
   ```sql
   SELECT count(*) FROM rate_limits
   WHERE created_at > NOW() - INTERVAL '1 hour';
   ```
   If this is much larger than expected, the cleanup logic in
   `checkRateLimit` might be failing silently — check PostHog Exceptions
   for `action = checkRateLimit_cleanup` events.
4. **Email deliverability**: if users can create accounts but don't get
   verification emails, it's Resend. Resend dashboard → Logs → search
   by recipient. Bounces and complaints show up here.

---

## "Notifications aren't being delivered"

1. **PostHog Exceptions** → filter by `route = chatWebhook` or `action = notifyAfterFinalize`.
2. **FCM** (native apps): Firebase console → Cloud Messaging → recent
   sends. Check for unregistered tokens — the
   `notifications/send` handler auto-cleans invalid tokens, but if FCM
   is rejecting _everything_, the service account key may have expired.
3. **Web Push**: open the app in the user's affected browser, open
   DevTools → Application → Service Workers. A deregistered service
   worker means the user needs to reload. A registered-but-inactive one
   means the push subscription was revoked.
4. **Cron**: if the weekly digest or session reminders aren't firing,
   check Vercel → Functions → Cron. Each run should log `cron_start` +
   `cron_complete` (LR-05). Missing lines = cron didn't run. Missing
   `cron_complete` after a `cron_start` = the run started but crashed.

---

## Communication template

If an incident is user-visible, drop a message in the community Slack /
Discord / whatever channel you're using:

```
We're investigating an issue with [briefly: signups / payments /
notifications]. The app is [accessible / down] for users right now.
We'll update here every 15 minutes until it's resolved.

Started: <time in Colombia TZ>
Status: investigating / identified / rolling back / resolved
Next update: <time + 15 min>
```

Post the resolved message when `/api/health` is 200 and the original
symptom is gone. After resolution, write a short postmortem in
`docs/incidents/<date>-<slug>.md` with: timeline, root cause, fix,
and one action item to prevent recurrence.

---

## Things that look like incidents but aren't

- **403 on `/api/admin/*`**: user isn't an admin. Expected behavior.
- **429 everywhere**: you're testing from a shared IP that's been rate
  limited. Wait 60 seconds or use a different network.
- **503 from `/api/health` during deploy**: transient, clears within
  seconds of deploy promotion.
- **One user reports ghost screen**: check their cache. Full reload +
  service worker unregister fixes 80% of single-user ghost reports.
- **PostHog Exceptions shows `AbortError` on fetches**: someone navigated away
  mid-request. Not real.
