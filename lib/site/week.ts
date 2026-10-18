import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { logError } from '@/lib/logger';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { bogotaDateOffset, bogotaToday } from '@/lib/time/bogotaDate';
import { pickBoard, sportCounts, sportRows, buildWeekSeries, WEEK_BOARD_DAYS, type BoardSessionRow } from './weekBoard';
import type { WeekRow } from './weekTypes';

/**
 * T-SITE1 Part B. The live "La semana" board, read on the server.
 *
 * SERVICE ROLE, SERVER ONLY. The anon key cannot read `sessions` (measured
 * 2026-10-16: 42501), and the board must not depend on a public view's shape.
 * The client never sees this module; it gets WeekRow, whose every field is
 * public (lib/site/weekTypes). The select names only the columns the board
 * needs, so a private column cannot ride along.
 *
 * ONE QUERY, CACHED. unstable_cache keyed by the Bogotá day, revalidated every
 * five minutes, and React's cache() so the ticker (layout), the board (Inicio),
 * the soonest session (Para atletas) and the sport counts (Deportes) share one
 * result per render. The site segment also exports revalidate = 300.
 *
 * NEVER THROWS. A missing key at build time or a database hiccup renders the
 * empty state (the "Publica la tuya" row), never an error page.
 */
const SELECT =
  'id, sport, title, date, start_time, duration, location, max_participants, current_participants, ' +
  'is_paid, price_cents, currency, status, recurring_parent_id, partner_status, ' +
  'partner:featured_partners(business_name, status), ' +
  'creator:users!sessions_creator_id_fkey(id, name, avatar_url, is_admin, is_test_account, banned, deleted_at)';

/** How many raw occurrences to read: enough for eight varied rows after collapsing series. */
const QUERY_LIMIT = 300;

export const WEEK_BOARD_REVALIDATE_SECONDS = 300;

/** `series`: every series this week, before the board picks eight (sport pages, T-SHARE1). */
type WeekData = { rows: WeekRow[]; counts: Record<string, number>; series: WeekRow[] };
const EMPTY: WeekData = { rows: [], counts: {}, series: [] };

async function queryWeek(today: string): Promise<WeekData> {
  const now = new Date();
  const lastDay = bogotaDateOffset(WEEK_BOARD_DAYS, now);
  const nowTime = now.toLocaleTimeString('en-GB', { timeZone: 'America/Bogota', hour12: false }).slice(0, 5);
  const { data, error } = await getServiceRoleClient()
    .from('sessions')
    .select(SELECT)
    .eq('status', 'active')
    .eq('visibility', 'public')
    .gte('date', today)
    .lte('date', lastDay)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(QUERY_LIMIT);
  if (error) {
    logError(error, { action: 'site.fetchWeekBoard' });
    return EMPTY;
  }
  const raw = (data ?? []) as unknown as BoardSessionRow[];
  const series = buildWeekSeries(raw, today, lastDay, nowTime);
  return { rows: pickBoard(series), counts: sportCounts(raw, today, lastDay, nowTime), series };
}

const fetchWeek = cache(async (): Promise<WeekData> => {
  const today = bogotaToday();
  try {
    // v2: T-SHARE1 added `series`; a cached entry from before it must not be read.
    return await unstable_cache(() => queryWeek(today), ['site-week-v2', today], {
      revalidate: WEEK_BOARD_REVALIDATE_SECONDS,
      tags: ['site-week-board'],
    })();
  } catch (error) {
    logError(error, { action: 'site.fetchWeekBoard' });
    return EMPTY;
  }
});

/** The board's rows, at most eight, soonest first. Empty on any failure. */
export async function fetchWeekBoard(): Promise<WeekRow[]> {
  return (await fetchWeek()).rows;
}

/** A sport page's week block (T-SHARE1): up to `max` series of those sports. Empty on any failure. */
export async function fetchWeekSportRows(sports: readonly string[], max: number): Promise<WeekRow[]> {
  return sportRows((await fetchWeek()).series ?? [], sports, max);
}

/** Sessions this week per sport key (Deportes chips). Empty on any failure. */
export async function fetchWeekSportCounts(): Promise<Record<string, number>> {
  return (await fetchWeek()).counts;
}
