import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, gymId } = gate;

  if (!gymId) {
    return NextResponse.json({ success: false, error: 'gym_required' }, { status: 400 });
  }

  const clientId = req.nextUrl.searchParams.get('client_id');
  if (!clientId) {
    return NextResponse.json({ success: false, error: 'client_id_required' }, { status: 400 });
  }

  try {
    const { data: enrollment } = await supabase
      .from('tribe_os_sequence_enrollments')
      .select('id, sequence_id, status, current_step')
      .eq('gym_id', gymId)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!enrollment) {
      return NextResponse.json({ success: true, data: null });
    }

    const { data: seq } = await supabase
      .from('tribe_os_sequences')
      .select('name')
      .eq('id', enrollment.sequence_id)
      .eq('gym_id', gymId)
      .maybeSingle();

    const { data: steps } = await supabase
      .from('tribe_os_sequence_steps')
      .select('position')
      .eq('sequence_id', enrollment.sequence_id)
      .eq('gym_id', gymId)
      .order('position', { ascending: true });

    const { data: completions } = await supabase
      .from('tribe_os_step_completions')
      .select('step_position')
      .eq('enrollment_id', enrollment.id)
      .eq('gym_id', gymId);

    return NextResponse.json({
      success: true,
      data: {
        status: enrollment.status,
        sequenceName: seq?.name ?? '',
        currentStep: enrollment.current_step,
        totalSteps: steps?.length ?? 0,
        completions: (completions ?? []).map((c) => c.step_position),
      },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/sequences/member-enrollment' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
