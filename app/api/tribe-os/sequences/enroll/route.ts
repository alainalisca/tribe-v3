import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import type { EnrolledByType } from '@/lib/tribe-os/sequences/constants';

const EnrollSchema = z.object({
  client_id: z.string().uuid(),
  sequence_id: z.string().uuid().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  if (!gymId) {
    return NextResponse.json({ success: false, error: 'gym_required' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const parsed = EnrollSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
    }

    const { client_id } = parsed.data;
    let { sequence_id } = parsed.data;

    if (!sequence_id) {
      const { data: seq } = await supabase
        .from('tribe_os_sequences')
        .select('id')
        .eq('gym_id', gymId)
        .eq('active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!seq) {
        return NextResponse.json({ success: false, error: 'no_active_sequence' }, { status: 400 });
      }
      sequence_id = seq.id;
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: recent } = await supabase
      .from('tribe_os_sequence_enrollments')
      .select('id, status, updated_at')
      .eq('gym_id', gymId)
      .eq('client_id', client_id);

    for (const e of recent ?? []) {
      if (e.status === 'active' || e.status === 'pending_approval') {
        return NextResponse.json({ success: false, error: 'already_enrolled' }, { status: 409 });
      }
      if (new Date(e.updated_at) > new Date(thirtyDaysAgo)) {
        return NextResponse.json({ success: false, error: 'cooldown' }, { status: 409 });
      }
    }

    const enrolledByType: EnrolledByType = 'user';

    const { data: enrollment, error } = await supabase
      .from('tribe_os_sequence_enrollments')
      .insert({
        gym_id: gymId,
        client_id,
        sequence_id,
        status: 'active',
        current_step: 1,
        enrolled_by_type: enrolledByType,
        enrolled_by: userId,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: 'already_enrolled' }, { status: 409 });
      }
      if (error.code === '23514') {
        logError(error, { route: 'POST /api/tribe-os/sequences/enroll', code: '23514' });
        return NextResponse.json({ success: false, error: 'constraint_violation' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, data: { id: enrollment.id } });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/sequences/enroll' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
