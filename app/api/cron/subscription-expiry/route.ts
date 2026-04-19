import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { checkAndExpireSubscriptions } from '@/lib/dal/subscriptions';

/**
 * Daily cron: find users whose Tribe+ subscription has expired with
 * auto-renew off, and flip them back to 'free'. Auto-renew charging is
 * handled separately (future gateway integration).
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

    const res = await checkAndExpireSubscriptions(supabase);
    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, expired: res.data?.expired ?? 0 });
  } catch (error) {
    logError(error, { action: 'subscription-expiry-cron' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
