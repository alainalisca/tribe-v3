import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { getGym } from '@/lib/dal/gyms';
import { dueDate, isDue, nextStep as findNextStep, isSequenceFinished } from '@/lib/tribe-os/sequences/helpers';
import { todayBogota } from '@/lib/tribe-os/sequences/helpers';

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

    const { data: enrollments } = await supabase
      .from('tribe_os_sequence_enrollments')
      .select('id, client_id, sequence_id, status, current_step, started_at, enrolled_by_type, approved_by, approved_at')
      .eq('gym_id', gymId)
      .in('status', ['active', 'pending_approval']);

    const { data: sequences } = await supabase
      .from('tribe_os_sequences')
      .select('id, name')
      .eq('gym_id', gymId);

    const seqMap = new Map((sequences ?? []).map((s) => [s.id, s]));

    const { data: allSteps } = await supabase
      .from('tribe_os_sequence_steps')
      .select('id, sequence_id, position, day_offset, channel, template_key, note')
      .eq('gym_id', gymId)
      .order('position', { ascending: true });

    const stepsBySeq = new Map<string, typeof allSteps>();
    for (const step of allSteps ?? []) {
      const arr = stepsBySeq.get(step.sequence_id) ?? [];
      arr.push(step);
      stepsBySeq.set(step.sequence_id, arr);
    }

    const { data: completions } = await supabase
      .from('tribe_os_step_completions')
      .select('enrollment_id, step_position')
      .eq('gym_id', gymId);

    const completedSet = new Set((completions ?? []).map((c) => `${c.enrollment_id}:${c.step_position}`));

    const activeEnrollmentIds = (enrollments ?? []).filter((e) => e.status === 'active').map((e) => e.client_id);
    const allClientIds = [...new Set((enrollments ?? []).map((e) => e.client_id))];

    const { data: clients } = await supabase
      .from('clients')
      .select('id, name, phone, plan_ends_on, membership_plan')
      .eq('gym_id', gymId)
      .in('id', allClientIds.length > 0 ? allClientIds : ['00000000-0000-0000-0000-000000000000']);

    const clientMap = new Map((clients ?? []).map((c) => [c.id, c]));

    const { data: scores } = await supabase
      .from('client_retention_v2')
      .select('client_id, signals')
      .eq('gym_id', gymId)
      .in('client_id', allClientIds.length > 0 ? allClientIds : ['00000000-0000-0000-0000-000000000000']);

    const scoreMap = new Map((scores ?? []).map((s) => [s.client_id, s]));

    const { data: settings } = await supabase
      .from('tribe_os_gym_settings')
      .select('sequence_autonomy')
      .eq('gym_id', gymId)
      .maybeSingle();

    const autonomy = settings?.sequence_autonomy ?? 'manual';

    const tasks: Array<{
      enrollmentId: string;
      clientId: string;
      clientName: string | null;
      clientPhone: string | null;
      sequenceName: string;
      stepPosition: number;
      totalSteps: number;
      channel: string;
      templateKey: string | null;
      note: string | null;
      dueDateStr: string;
      overdue: boolean;
      overdueDaysCount: number;
      daysSinceLastActivity: number | null;
      planValue: string | null;
    }> = [];

    const pending: Array<{
      enrollmentId: string;
      clientId: string;
      clientName: string | null;
      sequenceName: string;
      enrolledByType: string;
    }> = [];

    const today = todayBogota();

    for (const e of enrollments ?? []) {
      const seq = seqMap.get(e.sequence_id);
      if (!seq) continue;
      const steps = stepsBySeq.get(e.sequence_id) ?? [];
      const client = clientMap.get(e.client_id);
      const score = scoreMap.get(e.client_id);

      if (e.status === 'pending_approval') {
        pending.push({
          enrollmentId: e.id,
          clientId: e.client_id,
          clientName: client?.name ?? null,
          sequenceName: seq.name,
          enrolledByType: e.enrolled_by_type,
        });
        continue;
      }

      const currentStepDef = steps.find((s) => s.position === e.current_step);
      if (!currentStepDef) continue;

      const stepDue = dueDate(e.started_at, currentStepDef.day_offset);
      if (stepDue > today) continue;

      const isCompleted = completedSet.has(`${e.id}:${e.current_step}`);
      if (isCompleted) continue;

      const od = Math.max(0, Math.round((new Date(today).getTime() - new Date(stepDue).getTime()) / 86_400_000));

      tasks.push({
        enrollmentId: e.id,
        clientId: e.client_id,
        clientName: client?.name ?? null,
        clientPhone: client?.phone ?? null,
        sequenceName: seq.name,
        stepPosition: e.current_step,
        totalSteps: steps.length,
        channel: currentStepDef.channel,
        templateKey: currentStepDef.template_key,
        note: currentStepDef.note,
        dueDateStr: stepDue,
        overdue: od > 0,
        overdueDaysCount: od,
        daysSinceLastActivity: score?.signals?.days_since_last_activity ?? null,
        planValue: client?.membership_plan ?? null,
      });
    }

    tasks.sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (a.overdue && b.overdue) return b.overdueDaysCount - a.overdueDaysCount;
      return a.dueDateStr.localeCompare(b.dueDateStr);
    });

    const activeCount = (enrollments ?? []).filter((e) => e.status === 'active').length;

    return NextResponse.json({
      success: true,
      data: {
        tasks,
        pending: autonomy === 'suggest' ? pending : [],
        activeCount,
        autonomy,
        isOwner,
      },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/sequences/tasks' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

const CompleteSchema = z.object({
  enrollment_id: z.string().uuid(),
  step_position: z.number().int().min(1).max(20),
  channel: z.enum(['whatsapp', 'call', 'in_person', 'other']),
  client_id: z.string().uuid(),
  note: z.string().max(500).optional(),
});

const ApproveSchema = z.object({
  enrollment_id: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  reason: z.string().max(200).optional(),
});

const StopSchema = z.object({
  enrollment_id: z.string().uuid(),
  reason: z.string().min(1).max(200),
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
    const actionType = body.action_type as string;

    if (actionType === 'complete') {
      const parsed = CompleteSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
      }
      const { enrollment_id, step_position, channel, client_id, note } = parsed.data;

      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: existing } = await supabase
        .from('client_touches')
        .select('id')
        .eq('gym_id', gymId)
        .eq('client_id', client_id)
        .eq('channel', channel)
        .eq('created_by', userId)
        .gte('created_at', twoMinAgo)
        .limit(1)
        .maybeSingle();

      let touchId: string;
      if (existing) {
        touchId = existing.id;
      } else {
        const { data: touch, error: touchErr } = await supabase
          .from('client_touches')
          .insert({
            gym_id: gymId,
            client_id,
            channel,
            note: note ?? null,
            created_by: userId,
          })
          .select('id')
          .single();
        if (touchErr) throw touchErr;
        touchId = touch.id;
      }

      const { error: compErr } = await supabase.from('tribe_os_step_completions').insert({
        enrollment_id,
        gym_id: gymId,
        step_position,
        touch_id: touchId,
      });

      if (compErr) {
        if (compErr.code === '23505') {
          return NextResponse.json({ success: true, data: { dedupe: true } });
        }
        throw compErr;
      }

      const { data: steps } = await supabase
        .from('tribe_os_sequence_steps')
        .select('position')
        .eq('sequence_id', body.sequence_id ?? '')
        .eq('gym_id', gymId)
        .order('position', { ascending: true });

      const { data: enrollment } = await supabase
        .from('tribe_os_sequence_enrollments')
        .select('sequence_id, current_step')
        .eq('id', enrollment_id)
        .eq('gym_id', gymId)
        .single();

      if (enrollment && steps) {
        const seqSteps = steps;
        const ns = findNextStep(seqSteps, step_position);

        if (ns) {
          await supabase
            .from('tribe_os_sequence_enrollments')
            .update({ current_step: ns.position, updated_at: new Date().toISOString() })
            .eq('id', enrollment_id)
            .eq('gym_id', gymId);
        } else {
          await supabase
            .from('tribe_os_sequence_enrollments')
            .update({ status: 'completed', updated_at: new Date().toISOString() })
            .eq('id', enrollment_id)
            .eq('gym_id', gymId);
        }
      }

      return NextResponse.json({ success: true, data: { touchId } });
    }

    if (actionType === 'approve') {
      const parsed = ApproveSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
      }

      const gymRes = await getGym(supabase, gymId);
      if (!gymRes.data || gymRes.data.owner_user_id !== userId) {
        return NextResponse.json({ success: false, error: 'owner_only' }, { status: 403 });
      }

      const { enrollment_id, action, reason } = parsed.data;

      if (action === 'approve') {
        await supabase
          .from('tribe_os_sequence_enrollments')
          .update({
            status: 'active',
            approved_by: userId,
            approved_at: new Date().toISOString(),
            started_at: new Date().toISOString(),
            current_step: 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', enrollment_id)
          .eq('gym_id', gymId)
          .eq('status', 'pending_approval');
      } else {
        await supabase
          .from('tribe_os_sequence_enrollments')
          .update({
            status: 'stopped',
            stopped_reason: reason ?? 'Rechazado',
            updated_at: new Date().toISOString(),
          })
          .eq('id', enrollment_id)
          .eq('gym_id', gymId)
          .eq('status', 'pending_approval');
      }

      return NextResponse.json({ success: true });
    }

    if (actionType === 'stop') {
      const parsed = StopSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ success: false, error: 'invalid_body' }, { status: 400 });
      }

      await supabase
        .from('tribe_os_sequence_enrollments')
        .update({
          status: 'stopped',
          stopped_reason: parsed.data.reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', parsed.data.enrollment_id)
        .eq('gym_id', gymId)
        .in('status', ['active', 'pending_approval']);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'unknown_action' }, { status: 400 });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/sequences/tasks' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
