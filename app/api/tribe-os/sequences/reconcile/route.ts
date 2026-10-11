import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { filterContactToday, type ContactFilterRow } from '@/lib/tribe-os/contactFilter';

export async function POST(): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, gymId } = gate;

  if (!gymId) {
    return NextResponse.json({ success: false, error: 'gym_required' }, { status: 400 });
  }

  try {
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
        }
      }
    }

    // --- b. Autonomy: suggest/auto enrollment ---
    const { data: settings } = await supabase
      .from('tribe_os_gym_settings')
      .select('sequence_autonomy')
      .eq('gym_id', gymId)
      .maybeSingle();

    const autonomy = settings?.sequence_autonomy ?? 'manual';

    if (autonomy === 'suggest' || autonomy === 'auto') {
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
          .select('id, name, phone, joined_on, tags, plan_ends_on')
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

        const enrollStatus = autonomy === 'auto' ? 'active' : 'pending_approval';

        for (const c of candidates) {
          if (openSet.has(c.id) || recentEndedSet.has(c.id)) continue;

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

          if (error && error.code !== '23505') {
            logError(error, { route: 'POST /api/tribe-os/sequences/reconcile', step: 'enroll' });
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/sequences/reconcile' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
