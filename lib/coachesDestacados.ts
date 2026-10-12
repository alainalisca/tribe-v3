/**
 * T-PLAN1 part D: which sessions go in the home feed's "Coaches destacados" row.
 *
 * Derived from the sessions the feed has ALREADY loaded (fetchUpcomingSessions
 * embeds the creator's coach_plan while COACH_PLANS_ENABLED), so the row costs
 * no extra query at all and is cached exactly like the feed, because it is the
 * feed. The main feed below is unchanged.
 */

import { bogotaDateOffset, bogotaToday } from '@/lib/time/bogotaDate';
import { DESTACADOS_PLANS, getCoachPlan } from '@/lib/subscription/coachPlans';

export const DESTACADOS_MAX = 10;
export const DESTACADOS_DAYS = 7;

interface DestacadoCandidate {
  date: string;
  start_time: string | null;
  status?: string | null;
  creator?: { coach_plan?: string | null } | null;
}

/** Upcoming sessions (today through the next 7 days) by paid or ambassador coaches, soonest first, max 10. */
export function selectCoachesDestacados<T extends DestacadoCandidate>(
  sessions: readonly T[],
  now: Date = new Date()
): T[] {
  const from = bogotaToday(now);
  const to = bogotaDateOffset(DESTACADOS_DAYS, now);
  return sessions
    .filter((s) => (s.status ?? 'active') === 'active')
    .filter((s) => s.date >= from && s.date <= to)
    .filter((s) => DESTACADOS_PLANS.includes(getCoachPlan(s.creator)))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start_time ?? '').localeCompare(b.start_time ?? ''))
    .slice(0, DESTACADOS_MAX);
}
