import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { bogotaToday } from '@/lib/tribe-os/dates';
import type { SupabaseClient } from '@supabase/supabase-js';

const PAGE_SIZE = 1000;

interface TouchRow {
  id: string;
  client_id: string;
  channel: string;
  note: string | null;
  created_at: string;
  clients: { name: string | null } | { name: string | null }[] | null;
  users: { name: string | null } | { name: string | null }[] | null;
}

interface VisitRow {
  client_id: string;
  visited_at: string;
}

async function fetchTouchesPage(
  supabase: SupabaseClient,
  gymId: string,
  from: number,
  size: number,
  channel?: string,
  clientId?: string,
): Promise<{ data: TouchRow[]; count: number }> {
  let query = supabase
    .from('client_touches')
    .select('id, client_id, channel, note, created_at, clients(name), users!created_by(name)', {
      count: 'exact',
    })
    .eq('gym_id', gymId)
    .order('created_at', { ascending: false })
    .range(from, from + size - 1);

  if (channel) {
    query = query.eq('channel', channel);
  }
  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data ?? []) as TouchRow[], count: count ?? 0 };
}

async function fetchVisitsForClients(
  supabase: SupabaseClient,
  gymId: string,
  clientIds: string[],
  since: string,
): Promise<VisitRow[]> {
  if (clientIds.length === 0) return [];
  const all: VisitRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('client_visits')
      .select('client_id, visited_at')
      .eq('gym_id', gymId)
      .in('client_id', clientIds)
      .gte('visited_at', since + 'T00:00:00Z')
      .order('visited_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as VisitRow[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, gymId } = gate;

  if (!gymId) {
    return NextResponse.json({ success: false, error: 'gym_required' }, { status: 400 });
  }

  const params = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10));
  const perPage = Math.min(50, Math.max(10, parseInt(params.get('per_page') ?? '25', 10)));
  const channel = params.get('channel') || undefined;
  const outcome = params.get('outcome') || undefined;
  const search = params.get('search')?.trim().toLowerCase() || undefined;
  const clientIdFilter = params.get('client_id') || undefined;

  try {
    const today = bogotaToday();
    const monthStart = today.slice(0, 8) + '01';

    const from = (page - 1) * perPage;
    const { data: touches } = await fetchTouchesPage(
      supabase,
      gymId,
      0,
      PAGE_SIZE,
      channel,
      clientIdFilter,
    );

    const clientIds = [...new Set(touches.map((t) => t.client_id))];

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const lookbackDate = touches.length > 0
      ? touches[touches.length - 1].created_at.slice(0, 10)
      : fourteenDaysAgo;
    const sinceDate = lookbackDate < fourteenDaysAgo ? lookbackDate : fourteenDaysAgo;

    const visits = await fetchVisitsForClients(supabase, gymId, clientIds, sinceDate);

    const now = new Date();
    const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

    type Outcome = 'came_back' | 'waiting' | 'no_response';

    function computeOutcome(touch: TouchRow): { outcome: Outcome; days?: number } {
      const touchMs = new Date(touch.created_at).getTime();
      let earliestVisitMs: number | null = null;
      for (const v of visits) {
        if (v.client_id !== touch.client_id) continue;
        const visitMs = new Date(v.visited_at).getTime();
        if (visitMs <= touchMs) continue;
        if (visitMs - touchMs > FOURTEEN_DAYS_MS) continue;
        if (earliestVisitMs === null || visitMs < earliestVisitMs) {
          earliestVisitMs = visitMs;
        }
      }
      if (earliestVisitMs !== null) {
        return { outcome: 'came_back', days: Math.ceil((earliestVisitMs - touchMs) / (24 * 60 * 60 * 1000)) };
      }
      const age = now.getTime() - touchMs;
      return age < FOURTEEN_DAYS_MS ? { outcome: 'waiting' } : { outcome: 'no_response' };
    }

    let enriched = touches.map((t) => {
      const o = computeOutcome(t);
      const clientObj = Array.isArray(t.clients) ? t.clients[0] : t.clients;
      const userObj = Array.isArray(t.users) ? t.users[0] : t.users;
      return {
        id: t.id,
        client_id: t.client_id,
        client_name: clientObj?.name ?? null,
        channel: t.channel,
        note: t.note,
        created_by_name: userObj?.name ?? null,
        created_at: t.created_at,
        outcome: o.outcome,
        came_back_days: o.days ?? null,
      };
    });

    if (search) {
      enriched = enriched.filter((t) =>
        (t.client_name ?? '').toLowerCase().includes(search),
      );
    }

    if (outcome) {
      enriched = enriched.filter((t) => t.outcome === outcome);
    }

    const monthTouches = enriched.filter((t) => t.created_at >= monthStart + 'T00:00:00Z');
    const monthTotal = monthTouches.length;
    const monthCameBack = monthTouches.filter((t) => t.outcome === 'came_back').length;
    const conversionPct = monthTotal > 0 ? Math.round((monthCameBack / monthTotal) * 100) : 0;

    const totalFiltered = enriched.length;
    const paginated = enriched.slice(from, from + perPage);

    return NextResponse.json({
      success: true,
      data: {
        touches: paginated,
        total: totalFiltered,
        page,
        per_page: perPage,
        summary: {
          month_total: monthTotal,
          month_came_back: monthCameBack,
          conversion_pct: conversionPct,
        },
      },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/messages' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
