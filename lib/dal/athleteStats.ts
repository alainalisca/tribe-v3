/** DAL: athlete training statistics — aggregates for the My Training dashboard. */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';

export interface AthleteStats {
  totalSessions: number;
  currentStreak: number;
  longestStreak: number;
  sportsTried: number;
  uniqueInstructors: number;
  sessionsThisMonth: number;
  sessionsLastMonth: number;
}

export interface TrainingHistoryEntry {
  session_id: string;
  title: string;
  sport: string;
  date: string;
  start_time: string;
  location: string;
  instructor: { id: string; name: string; avatar_url: string | null } | null;
  user_rating: number | null;
}

type AttendanceRow = {
  session_id: string;
  sessions: {
    id: string;
    title: string | null;
    sport: string | null;
    date: string;
    start_time: string | null;
    location: string | null;
    creator_id: string | null;
    creator: { id: string; name: string; avatar_url: string | null } | null;
  } | null;
};

/**
 * Treat a participation as "attended" when the participant row is confirmed
 * and the session's date is today or earlier.
 */
async function fetchAttendedSessions(
  supabase: SupabaseClient,
  userId: string,
  selectExtra = ''
): Promise<DalResult<AttendanceRow[]>> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const selection = `
    session_id,
    sessions:session_id(
      id, title, sport, date, start_time, location, creator_id,
      creator:creator_id(id, name, avatar_url)${selectExtra}
    )
  `;

  const { data, error } = await supabase
    .from('session_participants')
    .select(selection)
    .eq('user_id', userId)
    .eq('status', 'confirmed');

  if (error) return { success: false, error: error.message };

  const rows = ((data || []) as unknown as AttendanceRow[]).filter(
    (row) => row.sessions && row.sessions.date && row.sessions.date <= todayIso
  );
  return { success: true, data: rows };
}

/** Monday-of-week key used for streak calculation. */
function isoWeekKey(d: Date): string {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = copy.getUTCDay() || 7; // Sunday=7
  copy.setUTCDate(copy.getUTCDate() - (dayNum - 1));
  return copy.toISOString().slice(0, 10);
}

function computeStreaks(dates: string[]): { current: number; longest: number } {
  if (dates.length === 0) return { current: 0, longest: 0 };

  const weekSet = new Set<string>();
  for (const d of dates) {
    weekSet.add(isoWeekKey(new Date(d + 'T00:00:00Z')));
  }
  const weeks = Array.from(weekSet).sort(); // ascending ISO date strings

  // Longest consecutive run of weeks (each week is 7 days apart from the next)
  let longest = 1;
  let run = 1;
  for (let i = 1; i < weeks.length; i++) {
    const prev = new Date(weeks[i - 1] + 'T00:00:00Z').getTime();
    const cur = new Date(weeks[i] + 'T00:00:00Z').getTime();
    const diffWeeks = Math.round((cur - prev) / (7 * 86400000));
    if (diffWeeks === 1) {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  // Current streak: walk back from the current week
  const currentWeek = isoWeekKey(new Date());
  const currentIdx = weeks.indexOf(currentWeek);
  const lastWeek = isoWeekKey(new Date(Date.now() - 7 * 86400000));
  const lastIdx = weeks.indexOf(lastWeek);

  let anchor = -1;
  if (currentIdx !== -1) anchor = currentIdx;
  else if (lastIdx !== -1) anchor = lastIdx;

  let current = 0;
  if (anchor !== -1) {
    current = 1;
    for (let i = anchor - 1; i >= 0; i--) {
      const prev = new Date(weeks[i] + 'T00:00:00Z').getTime();
      const next = new Date(weeks[i + 1] + 'T00:00:00Z').getTime();
      const diffWeeks = Math.round((next - prev) / (7 * 86400000));
      if (diffWeeks === 1) current += 1;
      else break;
    }
  }

  return { current, longest: Math.max(longest, current) };
}

/** Aggregate athlete stats: total attended, streaks, sports, instructors, monthly counts. */
export async function fetchAthleteStats(supabase: SupabaseClient, userId: string): Promise<DalResult<AthleteStats>> {
  try {
    const res = await fetchAttendedSessions(supabase, userId);
    if (!res.success) return { success: false, error: res.error };
    const rows = res.data || [];

    const sports = new Set<string>();
    const instructors = new Set<string>();
    const dates: string[] = [];
    const now = new Date();
    const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const lastMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const lastMonth = `${lastMonthDate.getUTCFullYear()}-${String(lastMonthDate.getUTCMonth() + 1).padStart(2, '0')}`;
    let sessionsThisMonth = 0;
    let sessionsLastMonth = 0;

    for (const row of rows) {
      const s = row.sessions;
      if (!s) continue;
      if (s.sport) sports.add(s.sport);
      if (s.creator_id) instructors.add(s.creator_id);
      if (s.date) {
        dates.push(s.date);
        const monthKey = s.date.slice(0, 7);
        if (monthKey === thisMonth) sessionsThisMonth += 1;
        else if (monthKey === lastMonth) sessionsLastMonth += 1;
      }
    }

    const { current, longest } = computeStreaks(dates);

    return {
      success: true,
      data: {
        totalSessions: rows.length,
        currentStreak: current,
        longestStreak: longest,
        sportsTried: sports.size,
        uniqueInstructors: instructors.size,
        sessionsThisMonth,
        sessionsLastMonth,
      },
    };
  } catch (error) {
    logError(error, { action: 'fetchAthleteStats', userId });
    return { success: false, error: 'Failed to fetch athlete stats' };
  }
}

/** Returns a map of date-string → attendance count for the last `days` days. */
export async function fetchTrainingHeatmap(
  supabase: SupabaseClient,
  userId: string,
  days: number = 84
): Promise<DalResult<Record<string, number>>> {
  try {
    const res = await fetchAttendedSessions(supabase, userId);
    if (!res.success) return { success: false, error: res.error };
    const rows = res.data || [];

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
    const cutoffIso = cutoff.toISOString().slice(0, 10);

    const map: Record<string, number> = {};
    for (const row of rows) {
      const d = row.sessions?.date;
      if (!d || d < cutoffIso) continue;
      map[d] = (map[d] || 0) + 1;
    }
    return { success: true, data: map };
  } catch (error) {
    logError(error, { action: 'fetchTrainingHeatmap', userId });
    return { success: false, error: 'Failed to fetch heatmap' };
  }
}

/** Recent attended training history, most recent session first. */
export async function fetchTrainingHistory(
  supabase: SupabaseClient,
  userId: string,
  limit: number = 20,
  offset: number = 0
): Promise<DalResult<TrainingHistoryEntry[]>> {
  try {
    const res = await fetchAttendedSessions(supabase, userId);
    if (!res.success) return { success: false, error: res.error };
    const rows = res.data || [];

    // Sort by date desc, then start_time desc
    rows.sort((a, b) => {
      const aDate = a.sessions?.date || '';
      const bDate = b.sessions?.date || '';
      if (aDate !== bDate) return bDate.localeCompare(aDate);
      const aStart = a.sessions?.start_time || '';
      const bStart = b.sessions?.start_time || '';
      return bStart.localeCompare(aStart);
    });

    const paged = rows.slice(offset, offset + limit);
    const sessionIds = paged.map((r) => r.sessions?.id).filter((x): x is string => !!x);

    // Which of these sessions has the user already reviewed?
    const reviewMap = new Map<string, number>();
    if (sessionIds.length > 0) {
      const { data: reviewRows } = await supabase
        .from('reviews')
        .select('session_id, rating')
        .eq('reviewer_id', userId)
        .in('session_id', sessionIds);
      for (const r of reviewRows || []) {
        reviewMap.set((r as { session_id: string }).session_id, (r as { rating: number }).rating);
      }
    }

    const history: TrainingHistoryEntry[] = paged.map((r) => {
      const s = r.sessions!;
      return {
        session_id: s.id,
        title: s.title || '',
        sport: s.sport || '',
        date: s.date,
        start_time: s.start_time || '',
        location: s.location || '',
        instructor: s.creator ? { id: s.creator.id, name: s.creator.name, avatar_url: s.creator.avatar_url } : null,
        user_rating: reviewMap.get(s.id) ?? null,
      };
    });

    return { success: true, data: history };
  } catch (error) {
    logError(error, { action: 'fetchTrainingHistory', userId });
    return { success: false, error: 'Failed to fetch training history' };
  }
}
