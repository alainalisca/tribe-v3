import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  // Run both weekly tasks
  const results = await Promise.allSettled([
    fetch(`${SITE_URL}/api/send-weekly-recap`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }
    }),
    fetch(`${SITE_URL}/api/send-inactive-nudge`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }
    })
  ]);

  return NextResponse.json({
    success: true,
    message: 'Weekly tasks executed',
    results: results.map(r => r.status)
  });
}
