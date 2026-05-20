# User actions needed (Al — read this when you're back from meetings)

Running list of things I could NOT do autonomously while fixing the Round-1 QA bugs.
Updated per fix. Items grouped by what they need from you.

## Migrations to apply in Supabase (run these in SQL editor)

- **BUG-002 (Q&A 404):** Apply `supabase/migrations/014_session_comments.sql`. The `session_comments` table is missing from your live DB, which is why every Q&A read returns 404 and "nothing happens" on send. Code-side I already made the send surface a clear error toast and the empty state read "couldn't load right now" instead of "be the first to ask." Once the migration is applied, Q&A will work as designed.
- **BUG-005 (Referral code empty):** Apply `supabase/migrations/014_referrals.sql` if it isn't in your DB. The same root cause as BUG-002 — `referrals` table missing means `getOrCreateReferralCode` can't insert and the page shows a blank code. Code-side I now display "Couldn't generate your code" instead of blank, and the Copy/WhatsApp/Share buttons are disabled when there's no code (so you stop sharing `/auth?ref=` URLs with nothing after the equals sign). Heads-up: there are TWO files named `014_*` (014_session_comments.sql and 014_referrals.sql) — both need to be applied, the numbering collision is pre-existing.

## Env vars to set/verify in Vercel

- **BUG-003 (Pay & Join):** If the button now shows a clear toast like "Failed to create Wompi transaction" or "Payment already completed", that's diagnostic of the real cause. Make sure these are set in **Preview** env (not just Production): `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_SANDBOX=true`. For USD paths: `STRIPE_SECRET_KEY` + webhooks pointed at the deployed URL. Without these the route returns a 5xx and the button looked silent before this fix; now it always toasts + logs.

## Supabase Storage buckets / RLS to configure

_(none yet)_

## Static assets to populate later (low priority)

- `public/images/sports/*.jpg` — real category photos for running/yoga/crossfit/cycling/boxing/pilates/etc. I disabled the sport-image map so missing images stop spamming 404s; cards render the sport gradient instead. When real photos exist, re-enable in `lib/sport-images.ts:getSessionHeroImage` (the SPORT_IMAGES map is still in the file, just unused).

## Design decisions I deferred to you

_(none yet)_

## Native (Capacitor) work that needs a native build/release

_(none yet)_

## Notes on bugs I marked deferred or partial

- **BUG-020 (Onboarding modal re-pops):** the dark-theme half is fixed (QuickGuide now uses theme tokens — respects light/dark). The persistence half stays on localStorage, which still gets cleared in incognito / cache clears / new device. A robust cross-device fix needs either a `users.seen_guides jsonb` column or use of `auth.user_metadata`. Both require a small effort I can do later; the current state is "mostly persistent on the same browser." Flag this as a follow-up.
- **BUG-018 (Tip modal copy):** superseded by #7 — tips are real charges now, the existing "Say thanks to {name}" / "100% goes to {name}" copy is correct. The QA confusion was that Al's test account is literally named "tribe".
- **BUG-023 (Map artifact), BUG-035 (Banner reposition), BUG-037 (Referral tracking backend)** — deferred per the spec.
