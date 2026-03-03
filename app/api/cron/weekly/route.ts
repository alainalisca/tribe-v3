import { NextResponse } from 'next/server';

/**
 * @description Weekly cron orchestrator that triggers both the weekly recap emails and inactive user re-engagement nudges in parallel.
 * @method GET
 * @auth Required - validates CRON_SECRET via Bearer token in the Authorization header.
 * @returns {{ success: boolean, message: string, results: string[] }} Execution status and settled promise statuses for each sub-task.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL!;

  // Run both weekly tasks
  const results = await Promise.allSettled([
    fetch(`${SITE_URL}/api/send-weekly-recap`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }),
    fetch(`${SITE_URL}/api/send-inactive-nudge`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }),
  ]);

  return NextResponse.json({
    success: true,
    message: 'Weekly tasks executed',
    results: results.map((r) => r.status),
  });
}
