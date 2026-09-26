import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';

const TouchBody = z.object({
  client_id: z.string().uuid(),
  channel: z.enum(['whatsapp', 'call', 'in_person', 'other']),
  note: z.string().max(500).optional(),
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
    const parsed = TouchBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
    }

    const { client_id, channel, note } = parsed.data;

    const { data, error } = await supabase
      .from('client_touches')
      .insert({
        gym_id: gymId,
        client_id,
        channel,
        note: note ?? null,
        created_by: userId,
      })
      .select('id, created_at')
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/retention/touches' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
