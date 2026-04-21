import { NextResponse } from 'next/server';
import { log, logError } from '@/lib/logger';

/**
 * @description Weekly cron orchestrator that triggers both the weekly recap emails and inactive user re-engagement nudges in parallel.
 * @method GET
 * @auth Required - validates CRON_SECRET via Bearer token in the Authorization header.
 * @returns {{ ok, route, duration_ms, results }} Settled statuses for each sub-task.
 */
export async function GET(request: Request) {
  // LR-05: structured run logging.
  const route = 'cron:weekly';
  const startedAt = Date.now();
  log('info', 'cron_start', { action: 'cron_start', route });

  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL!;

    const results = await Promise.allSettled([
      fetch(`${SITE_URL}/api/send-weekly-recap`, {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
      fetch(`${SITE_URL}/api/send-inactive-nudge`, {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r) => r.status === 'rejected').length;
    const duration_ms = Date.now() - startedAt;
    log('info', 'cron_complete', { action: 'cron_complete', route, duration_ms, fulfilled, rejected });

    return NextResponse.json({
      ok: true,
      route,
      duration_ms,
      results: results.map((r) => r.status),
    });
  } catch (error) {
    const duration_ms = Date.now() - startedAt;
    logError(error, { action: 'cron_failed', route, duration_ms });
    return NextResponse.json({ ok: false, route, error: 'Internal server error' }, { status: 500 });
  }
}
