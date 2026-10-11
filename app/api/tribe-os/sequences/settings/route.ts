import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { getGym } from '@/lib/dal/gyms';

export async function GET(): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  if (!gymId) {
    return NextResponse.json({ success: false, error: 'gym_required' }, { status: 400 });
  }

  try {
    const gymRes = await getGym(supabase, gymId);
    const isOwner = !!gymRes.data && gymRes.data.owner_user_id === userId;

    const { data: settings } = await supabase
      .from('tribe_os_gym_settings')
      .select('sequence_autonomy')
      .eq('gym_id', gymId)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      data: {
        autonomy: settings?.sequence_autonomy ?? 'manual',
        isOwner,
      },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/sequences/settings' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

const UpdateSchema = z.object({
  autonomy: z.enum(['manual', 'suggest', 'auto']),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  if (!gymId) {
    return NextResponse.json({ success: false, error: 'gym_required' }, { status: 400 });
  }

  try {
    const gymRes = await getGym(supabase, gymId);
    if (!gymRes.data || gymRes.data.owner_user_id !== userId) {
      return NextResponse.json({ success: false, error: 'owner_only' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
    }

    const { error } = await supabase
      .from('tribe_os_gym_settings')
      .upsert(
        { gym_id: gymId, sequence_autonomy: parsed.data.autonomy },
        { onConflict: 'gym_id' }
      );

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/sequences/settings' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
