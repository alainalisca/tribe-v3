# User actions needed (Al — read this when you're back from meetings)

Running list of things I could NOT do autonomously while fixing the Round-1 QA bugs.
Updated per fix. Items grouped by what they need from you.

## Migrations to apply in Supabase (run these in SQL editor)

- **BUG-002 (Q&A 404):** Apply `supabase/migrations/014_session_comments.sql`. The `session_comments` table is missing from your live DB, which is why every Q&A read returns 404 and "nothing happens" on send. Code-side I already made the send surface a clear error toast and the empty state read "couldn't load right now" instead of "be the first to ask." Once the migration is applied, Q&A will work as designed.

## Env vars to set/verify in Vercel

- **BUG-003 (Pay & Join):** If the button now shows a clear toast like "Failed to create Wompi transaction" or "Payment already completed", that's diagnostic of the real cause. Make sure these are set in **Preview** env (not just Production): `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_SANDBOX=true`. For USD paths: `STRIPE_SECRET_KEY` + webhooks pointed at the deployed URL. Without these the route returns a 5xx and the button looked silent before this fix; now it always toasts + logs.

## Supabase Storage buckets / RLS to configure

_(none yet)_

## Design decisions I deferred to you

_(none yet)_

## Native (Capacitor) work that needs a native build/release

_(none yet)_

## Notes on bugs I marked deferred or partial

_(none yet)_
