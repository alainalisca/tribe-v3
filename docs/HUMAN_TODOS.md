# Things that need a human (you)

Running list of items the autonomous build can't finish on its own.
Grows as I keep working. Sorted by urgency — top items block the
biggest unknowns.

## 🚨 Before the next ship-or-test session

### Vercel env vars to set

Required for full functionality on the preview deployment:

- `RESEND_API_KEY` — already set in prod, confirm preview has it too. Without
  this the intelligence digest email silently no-ops.
- `NEXT_PUBLIC_SITE_URL` — used to build absolute deep-links in outgoing
  emails. Should be the canonical URL of your deployment (e.g.
  `https://tribe-v3.vercel.app` or the custom domain when it lands).
  Falls back to `tribe-v3.vercel.app` if unset — fine for now.
- `CRON_SECRET` — already set, used by `/api/cron/tribe-os/intelligence`.
- `SUPABASE_SERVICE_ROLE_KEY` — already set, used by the digest sender +
  the seed endpoint.

For dev / staging testing:

- `ALLOW_SAMPLE_DATA_SEED=true`
- `NEXT_PUBLIC_ALLOW_SAMPLE_DATA_SEED=true`

Both gates must be set for the seed button to render + work. Production
deployments leave both unset.

### Run a real end-to-end test

Best done in one focused 60-minute session:

1. **Seed sample data**: set the two env vars above → redeploy → go to
   `/os/gym` → click "Seed sample data" → confirm.
2. **Verify the dashboard lights up**: KPIs populate, AT-risk widget shows
   Carlos / Sebastián / Luisa, recent activity feed has check-ins.
3. **Run intelligence engine**: `/os/intelligence` → click "Run
   intelligence engine" → confirm all 4 insight types fire
   (CHURN_RISK, RETENTION_OPP, REVENUE, GROWTH).
4. **Confirm the digest email arrived** in your inbox (sent from
   `tribe@aplusfitnessllc.com`). Check Resend dashboard for the send
   record if it doesn't show up.
5. **Test the bilingual templates**: flip language to ES on /os/intelligence
   → insight headlines should re-render in Spanish.
6. **Test CSV export**: `/os/members` → "Export CSV" → open in Excel,
   confirm columns match the importer.
7. **Test CSV import**: edit the exported file, add one row, re-import
   on /os/members → confirm new row appears + dupes go through (current
   implementation has no dedup).
8. **Test `/my-coach`**: temporarily change one of the seeded clients'
   email via SQL editor to match your auth user's email:
   ```sql
   UPDATE clients SET email = '<your-auth-email>'
   WHERE email = 'ana.garcia@sample.tribe.local';
   ```
   Then go to `/my-coach` and confirm the page renders with Ana's data.
9. **Test the home-page Tribe.OS shortcut**: home page header should show
   the briefcase button (only when you're premium).
10. **Test the back-to-Tribe shortcut**: inside `/os/dashboard`, the home
    icon in the top bar should jump you back to `/`.

### Cleanup after testing

```sql
-- Drops every sample-data row + cascades to attendance + partners
DELETE FROM clients WHERE 'sample-data' = ANY(tags);
-- Drops the seeded sessions
DELETE FROM sessions WHERE description = 'Sample data — generated for demo purposes.';
-- Drops any community_insights that referenced sample clients (defensive)
DELETE FROM community_insights WHERE gym_id NOT IN (SELECT id FROM gyms);
```

## 📝 Spanish copy review (Verónica)

Multiple files carry `// ES PENDING VERONICA REVIEW` markers. As of
the latest build, these need her eyes:

- `lib/email/intelligenceDigest.ts` — digest email subject + body
- `components/tribe-os/InsightsBanner.tsx` — dashboard nudge banner
- `components/tribe-os/TrainingPartnersSection.tsx` — member detail
- `components/tribe-os/ReachOutToTeamModal.tsx` — bulk-message modal
- `components/tribe-os/ImportClientsModal.tsx` — CSV import dialog
- `components/tribe-os/MyCoachEntryCard.tsx` — profile entry point
- `components/tribe-os/SampleDataSeedButton.tsx` — dev tools button
- `app/os/teams/page.tsx`, `app/os/teams/[id]/page.tsx` — team surfaces
- `app/os/intelligence/page.tsx` — insight type labels + empty states
- `app/my-coach/page.tsx` — member training dashboard
- `app/os/members/page.tsx` — Import / Export CSV labels
- `app/os/revenue/_components/AttendanceExportButton.tsx`
- `lib/ai/insight-templates.ts` — all four insight-type bodies + signals

Anything labeled "Auto-translation" or "ES PENDING VERONICA REVIEW" in
a copy bag should be replaced with native-quality Spanish.

## 🧪 Real-device validation

Things only verifiable on a physical phone:

- **iOS Safari notification permission** — confirm the in-app prompt
  (`NotificationPrompt`) is the only path that asks, never the auto-fire.
- **Android Chrome location permission** — same: only `requestUserLocation`
  paths should prompt.
- **PWA install prompt** flow.
- **Service worker** persistence across app restarts.
- **WhatsApp deep-links** from /os/clients/[id] + /os/intelligence — confirm
  they open the WhatsApp app on mobile (not just wa.me web).
- **CSV download** on iOS Safari (may surface as a share sheet instead of
  a direct save — that's iOS being iOS, not a bug).

## 🌐 Custom domain swap (pending)

Per the memory note: `tribe-v3.vercel.app` is the staging URL; a custom
domain will land. When it does:

- Update `NEXT_PUBLIC_SITE_URL` env var in Vercel
- Update Stripe webhook endpoints if the URL changed
- Update Stripe Connect return URLs
- Update Resend sender domain verification if relevant
- Update the App Store / Play Store listings if those carry the URL
- Update `lib/email/tribeOsWaitlist.ts` `APP_STORE_URL` / `GOOGLE_PLAY_URL`
  if they were placeholder
- Audit hardcoded `tribe-v3.vercel.app` strings — `grep -r tribe-v3.vercel.app`
  to catch any I missed

## 💳 Stripe Connect onboarding polish

The connect-bank-account flow exists but I haven't manually walked it on
a fresh account. Things to verify when you can:

- Brand-new gym owner → Settings → "Connect bank account" → completes
  Stripe Express onboarding without dead ends
- Webhook updates on capability-changed events
- The `payments` table actually accumulates rows when a session payment
  succeeds end-to-end
- The revenue CSV export gets non-empty rows after at least one real
  payment

## 🧹 Code/data items I noticed but didn't act on

- `lib/dal/clients.ts` is now over 900 lines (DAL pattern). Splitting
  into `clients-crud.ts`, `clients-csv.ts`, `clients-attendance.ts`
  would help maintainability but isn't urgent.
- `community_insights.confidence_score` is hardcoded per generator
  (0.7 for CHURN_RISK, 0.6 for RETENTION_OPP, etc.). Could be tuned
  based on real false-positive rates once you have data.
- The OnboardingChecklist's third step ("Invite a coach") links to
  `/os/coaches` — I haven't walked that flow end-to-end.
- No automated tests for the new code. The repo has Jest infrastructure
  (saw `*.test.tsx` files for FilterBar) — could add unit tests for the
  CSV parser, insight templates renderer, scoring math.

## 🛠 Features deferred to next autonomous round

Ranked by my read on impact:

1. **Coach-added-you welcome email** — when a coach creates a client whose
   email matches a Tribe user, send them an email pointing at /my-coach.
   Closes the discoverability loop between the coach's "add member" action
   and the member's surface.
2. **Bulk dismiss on /os/intelligence** — "dismiss all LOW" / "dismiss all
   in this section" → POST /api/tribe-os/intelligence/bulk-dismiss.
3. **Insight feedback** — let coaches mark an insight as "false positive"
   so we can later tune the heuristics. Schema already has `is_actioned`;
   would add a `feedback_signal` column or a separate table.
4. **Sample data cleanup button** — companion to the seed button on
   /os/gym, runs the cleanup SQL via the API instead of forcing the
   user into the Supabase editor.
5. **Per-team insights filter** on /os/intelligence — "show me only
   insights about team X."
6. **Stripe Connect rough-edge polish** (above) — but this is hard to do
   without an actual test account, so probably better as a human task.

I'll keep building down this list and updating this file as new items
surface.
