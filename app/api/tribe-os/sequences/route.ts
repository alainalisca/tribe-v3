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

    const { data: sequences, error } = await supabase
      .from('tribe_os_sequences')
      .select('id, name, active, created_at, updated_at')
      .eq('gym_id', gymId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const { data: steps } = await supabase
      .from('tribe_os_sequence_steps')
      .select('id, sequence_id, position, day_offset, channel, template_key, note')
      .eq('gym_id', gymId)
      .order('position', { ascending: true });

    const stepsBySeq = new Map<string, typeof steps>();
    for (const step of steps ?? []) {
      const arr = stepsBySeq.get(step.sequence_id) ?? [];
      arr.push(step);
      stepsBySeq.set(step.sequence_id, arr);
    }

    const result = (sequences ?? []).map((s) => ({
      ...s,
      steps: stepsBySeq.get(s.id) ?? [],
    }));

    return NextResponse.json({ success: true, data: { sequences: result, isOwner } });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/sequences' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

const StepSchema = z.object({
  position: z.number().int().min(1).max(20),
  day_offset: z.number().int().min(0).max(60),
  channel: z.enum(['whatsapp', 'call', 'in_person', 'other']),
  template_key: z.string().nullable().optional(),
  note: z.string().max(200).nullable().optional(),
});

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1).max(120)),
  active: z.boolean().optional(),
  steps: z.array(StepSchema).min(1).max(20),
});

const ToggleSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
});

const DeleteStepSchema = z.object({
  step_id: z.string().uuid(),
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
    const actionType = body.action_type as string;

    if (actionType === 'toggle') {
      const parsed = ToggleSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
      }
      const { error } = await supabase
        .from('tribe_os_sequences')
        .update({ active: parsed.data.active, updated_at: new Date().toISOString() })
        .eq('id', parsed.data.id)
        .eq('gym_id', gymId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (actionType === 'delete_step') {
      const parsed = DeleteStepSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
      }
      const { error } = await supabase
        .from('tribe_os_sequence_steps')
        .delete()
        .eq('id', parsed.data.step_id)
        .eq('gym_id', gymId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    const parsed = UpsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 });
    }

    const { id, name, active, steps } = parsed.data;
    const now = new Date().toISOString();

    let seqId: string;
    if (id) {
      const { error } = await supabase
        .from('tribe_os_sequences')
        .update({ name, active: active ?? true, updated_at: now })
        .eq('id', id)
        .eq('gym_id', gymId);
      if (error) throw error;
      seqId = id;

      await supabase
        .from('tribe_os_sequence_steps')
        .delete()
        .eq('sequence_id', id)
        .eq('gym_id', gymId);
    } else {
      const { data: seq, error } = await supabase
        .from('tribe_os_sequences')
        .insert({ gym_id: gymId, name, active: active ?? true })
        .select('id')
        .single();
      if (error) throw error;
      seqId = seq.id;
    }

    const stepRows = steps.map((s) => ({
      sequence_id: seqId,
      gym_id: gymId,
      position: s.position,
      day_offset: s.day_offset,
      channel: s.channel,
      template_key: s.template_key ?? null,
      note: s.note ?? null,
    }));

    const { error: stepsErr } = await supabase.from('tribe_os_sequence_steps').insert(stepRows);
    if (stepsErr) throw stepsErr;

    return NextResponse.json({ success: true, data: { id: seqId } });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/sequences' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
