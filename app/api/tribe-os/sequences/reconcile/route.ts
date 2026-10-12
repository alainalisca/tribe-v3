import { NextResponse } from 'next/server';
import { log, logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { filterContactToday, type ContactFilterRow } from '@/lib/tribe-os/contactFilter';
import { computeCurrentStep, bogotaStartOfDayUTC } from '@/lib/tribe-os/sequences/helpers';
import { SYSTEM_DAILY_ENROLL_CAP, PENDING_EXPIRY_DAYS } from '@/lib/tribe-os/sequences/constants';
import { monthlyValueCents, type PlanPrice } from '@/lib/tribe-os/forecast';

export async function POST(): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, gymId } = gate;

  if (!gymId) {
    return NextResponse.json({ success: false, error: 'gym_required' }, { status: 400 });
  }

  try {
    const counts = { auto_stopped: 0, repaired_steps: 0, completed: 0, suggested: 0, auto_enrolled: 0, expired_pending: 0 };

    // --- a. Auto-stop: visit after started_at => came_back ---
    const { data: openEnrollments } = await supabase
      .from('tribe_os_sequence_enrollments')
      .select('id, client_id, started_at, status')
      .eq('gym_id', gymId)
      .in('status', ['pending_approval', 'active']);

    if (openEnrollments && openEnrollments.length > 0) {
      const clientIds = [...new Set(openEnrollments.map((e) => e.client_id))];

      const earliestStart = openEnrollments.reduce(
        (min, e) => (e.started_at < min ? e.started_at : min),
        openEnrollments[0].started_at
      );

      const { data: visits } = await supabase
        .from('client_visits')
        .select('client_id, visited_at')
        .eq('gym_id', gymId)
        .in('client_id', clientIds)
        .gte('visited_at', earliestStart)
        .order('visited_at', { ascending: true });

      const visitMap = new Map<string, string>();
      for (const v of visits ?? []) {
        if (!visitMap.has(v.client_id)) {
          visitMap.set(v.client_id, v.visited_at);
        }
      }

      for (const e of openEnrollments) {
        const firstVisit = visitMap.get(e.client_id);
        if (firstVisit && firstVisit > e.started_at) {
          await supabase
            .from('tribe_os_sequence_enrollments')
            .update({
              status: 'came_back',
              stopped_reason: 'Visita registrada',
              updated_at: new Date().toISOString(),
            })
            .eq('id', e.id)
            .eq('gym_id', gymId);
          counts.auto_stopped++;
        }
      }
    }

    // --- b. Self-healing: repair current_step from completions ---
    const { data: activeEnrollments } = await supabase
      .from('tribe_os_sequence_enrollments')
      .select('id, sequence_id, current_step, status')
      .eq('gym_id', gymId)
      .eq('status', 'active');

    if (activeEnrollments && activeEnrollments.length > 0) {
      const seqIds = [...new Set(activeEnrollments.map((e) => e.sequence_id))];
      const enrollIds = activeEnrollments.map((e) => e.id);

      const { data: allSteps } = await supabase
        .from('tribe_os_sequence_steps')
        .select('sequence_id, position')
        .eq('gym_id', gymId)
        .in('sequence_id', seqIds);

      const stepsBySeq = new Map<string, { position: number }[]>();
      for (const s of allSteps ?? []) {
        const arr = stepsBySeq.get(s.sequence_id) ?? [];
        arr.push({ position: s.position });
        stepsBySeq.set(s.sequence_id, arr);
      }

      const { data: allComps } = await supabase
        .from('tribe_os_step_completions')
        .select('enrollment_id, step_position')
        .eq('gym_id', gymId)
        .in('enrollment_id', enrollIds);

      const compsByEnroll = new Map<string, number[]>();
      for (const c of allComps ?? []) {
        const arr = compsByEnroll.get(c.enrollment_id) ?? [];
        arr.push(c.step_position);
        compsByEnroll.set(c.enrollment_id, arr);
      }

      for (const e of activeEnrollments) {
        const steps = stepsBySeq.get(e.sequence_id) ?? [];
        if (steps.length === 0) continue;
        const done = compsByEnroll.get(e.id) ?? [];
        const computed = computeCurrentStep(steps, done);

        if (computed.finished && e.status === 'active') {
          await supabase
            .from('tribe_os_sequence_enrollments')
            .update({ status: 'completed', current_step: computed.position, updated_at: new Date().toISOString() })
            .eq('id', e.id)
            .eq('gym_id', gymId);
          counts.completed++;
        } else if (computed.position !== e.current_step) {
          await supabase
            .from('tribe_os_sequence_enrollments')
            .update({ current_step: computed.position, updated_at: new Date().toISOString() })
            .eq('id', e.id)
            .eq('gym_id', gymId);
          counts.repaired_steps++;
        }
      }
    }

    // --- c. Expire stale pending approvals (7 days without action) ---
    const expiryThreshold = new Date(Date.now() - PENDING_EXPIRY_DAYS * 86_400_000).toISOString();
    const { data: stalePending } = await supabase
      .from('tribe_os_sequence_enrollments')
      .select('id')
      .eq('gym_id', gymId)
      .eq('status', 'pending_approval')
      .lt('created_at', expiryThreshold);

    for (const sp of stalePending ?? []) {
      await supabase
        .from('tribe_os_sequence_enrollments')
        .update({ status: 'stopped', stopped_reason: 'Sin respuesta del dueño', updated_at: new Date().toISOString() })
        .eq('id', sp.id)
        .eq('gym_id', gymId);
      counts.expired_pending++;
    }

    // --- d. Autonomy: suggest/auto enrollment (capped) ---
    const { data: settings } = await supabase
      .from('tribe_os_gym_settings')
      .select('sequence_autonomy')
      .eq('gym_id', gymId)
      .maybeSingle();

    const autonomy = settings?.sequence_autonomy ?? 'manual';

    if (autonomy === 'suggest' || autonomy === 'auto') {
      const todayStart = bogotaStartOfDayUTC();
      const { count: todaySystemCount } = await supabase
        .from('tribe_os_sequence_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('gym_id', gymId)
        .eq('enrolled_by_type', 'system')
        .gte('created_at', todayStart);

      const remaining = SYSTEM_DAILY_ENROLL_CAP - (todaySystemCount ?? 0);

      if (remaining > 0) {
        const { data: activeSequence } = await supabase
          .from('tribe_os_sequences')
          .select('id')
          .eq('gym_id', gymId)
          .eq('active', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (activeSequence) {
          const { data: members } = await supabase
            .from('clients')
            .select('id, name, phone, joined_on, tags, plan_ends_on, membership_plan')
            .eq('gym_id', gymId);

          const { data: scores } = await supabase
            .from('client_retention_v2')
            .select('client_id, score, level, reasons, signals')
            .eq('gym_id', gymId);

          const scoreMap = new Map((scores ?? []).map((s) => [s.client_id, s]));

          const now = new Date();
          const sevenDaysAgo = new Date(now);
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

          const { data: touches } = await supabase
            .from('client_touches')
            .select('client_id, created_at')
            .eq('gym_id', gymId)
            .gte('created_at', sevenDaysAgo.toISOString())
            .order('created_at', { ascending: false });

          const touchMap = new Map<string, { created_at: string }>();
          for (const t of touches ?? []) {
            if (!touchMap.has(t.client_id)) {
              touchMap.set(t.client_id, { created_at: t.created_at });
            }
          }

          const contactRows: ContactFilterRow[] = (members ?? []).map((m) => {
            const s = scoreMap.get(m.id);
            return {
              id: m.id,
              level: s?.level ?? null,
              score: s?.score ?? null,
              days_since_last_activity: s?.signals?.days_since_last_activity ?? null,
              last_touch: touchMap.get(m.id) ?? null,
            };
          });

          const candidates = filterContactToday(contactRows);

          const memberPlanMap = new Map((members ?? []).map((m) => [m.id, m.membership_plan]));

          const { data: existingEnrollments } = await supabase
            .from('tribe_os_sequence_enrollments')
            .select('client_id, status, updated_at')
            .eq('gym_id', gymId);

          const openSet = new Set<string>();
          const recentEndedSet = new Set<string>();
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

          for (const e of existingEnrollments ?? []) {
            if (e.status === 'pending_approval' || e.status === 'active') {
              openSet.add(e.client_id);
            } else if (new Date(e.updated_at) > thirtyDaysAgo) {
              recentEndedSet.add(e.client_id);
            }
          }

          const eligible = candidates.filter((c) => !openSet.has(c.id) && !recentEndedSet.has(c.id));

          const { data: gymData } = await supabase
            .from('gyms')
            .select('default_currency')
            .eq('id', gymId)
            .single();
          const gymCurrency = (gymData?.default_currency as string) ?? 'COP';

          const { data: rawPlans } = await supabase
            .from('gym_plans')
            .select('name, price_cents, currency, duration_months')
            .eq('gym_id', gymId);
          const plans: PlanPrice[] = (rawPlans ?? []).map((p) => ({
            name: p.name as string,
            price_cents: p.price_cents as number,
            currency: p.currency as string,
            duration_months: p.duration_months as number,
          }));

          eligible.sort((a, b) => {
            const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
            if (scoreDiff !== 0) return scoreDiff;
            const va = monthlyValueCents(memberPlanMap.get(a.id) ?? null, plans, gymCurrency) ?? 0;
            const vb = monthlyValueCents(memberPlanMap.get(b.id) ?? null, plans, gymCurrency) ?? 0;
            return vb - va;
          });

          const toEnroll = eligible.slice(0, remaining);
          const enrollStatus = autonomy === 'auto' ? 'active' : 'pending_approval';

          for (const c of toEnroll) {
            const { error } = await supabase.from('tribe_os_sequence_enrollments').insert({
              gym_id: gymId,
              client_id: c.id,
              sequence_id: activeSequence.id,
              status: enrollStatus,
              current_step: 1,
              enrolled_by_type: 'system',
              enrolled_by: null,
              approved_by: null,
              approved_at: null,
            });

            if (error) {
              if (error.code !== '23505') {
                logError(error, { route: 'POST /api/tribe-os/sequences/reconcile', step: 'enroll' });
              }
            } else {
              if (enrollStatus === 'active') counts.auto_enrolled++;
              else counts.suggested++;
            }
          }
        }
      }
    }

    log('info', 'reconcile completed', { route: 'POST /api/tribe-os/sequences/reconcile', ...counts });

    return NextResponse.json({ success: true, data: counts });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/sequences/reconcile' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
