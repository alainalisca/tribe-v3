import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { resetMonthlyLeadCredits } from '@/lib/dal/leadDiscovery';

/**
 * Monthly cron (1st @ 00:00): reset each instructor's lead credits to their
 * tier's monthly allotment.
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const res = await resetMonthlyLeadCredits(supabase);
    if (!res.success) return NextResponse.json({ error: res.error }, { status: 500 });
    return NextResponse.json({ success: true, reset: res.data?.reset ?? 0 });
  } catch (error) {
    logError(error, { action: 'lead-credits-reset-cron' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
