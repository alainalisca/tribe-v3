import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isValidCronAuth } from '@/lib/auth/cron';
import { getResendContactsClient } from '@/lib/email/resendClient';
import { log, logError } from '@/lib/logger';
import { runContactSync } from '@/lib/newsletter/contactSync';

/**
 * Daily cron: keep the Resend newsletter contact list and the app's email
 * opt-out in agreement, in both directions. See lib/newsletter/contactSyncPlan.ts
 * for the rules and lib/newsletter/contactSync.ts for the pacing.
 *
 * A refused plan (the removal brake) answers 200 with `refused` set, not 500:
 * the job did exactly what it should, which was nothing. It is logged at warn
 * so it shows up in the logs without paging anyone as a crash.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const route = 'cron:newsletter-contacts';
  const startedAt = Date.now();
  log('info', 'cron_start', { action: 'cron_start', route });

  try {
    if (!isValidCronAuth(request.headers.get('authorization'))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const summary = await runContactSync(supabase, getResendContactsClient());
    const duration_ms = Date.now() - startedAt;
    if (summary.refused) {
      log('warn', 'newsletter_contacts_refused', { action: 'cron_refused', route, duration_ms, ...summary });
    } else {
      log('info', 'cron_complete', { action: 'cron_complete', route, duration_ms, ...summary });
    }
    return NextResponse.json({ ok: true, route, duration_ms, ...summary });
  } catch (error) {
    const duration_ms = Date.now() - startedAt;
    logError(error, { action: 'cron_failed', route, duration_ms });
    return NextResponse.json({ ok: false, route, error: 'Internal server error' }, { status: 500 });
  }
}
