import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';

export async function GET(): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, gymId } = gate;

  try {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('tribe_os_leads')
      .select('id, full_name, phone, status, next_follow_up_at, source, created_at')
      .eq('gym_id', gymId)
      .not('status', 'in', '("joined","lost")')
      .not('next_follow_up_at', 'is', null)
      .lte('next_follow_up_at', endOfDay.toISOString())
      .order('next_follow_up_at', { ascending: true });

    if (error) {
      logError(error, { route: 'GET /api/tribe-os/leads/tasks', gymId });
      return NextResponse.json({ success: false, error: 'list_failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/leads/tasks' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
