/**
 * Behavioral nudge generator. Turns a user's recent activity into
 * prioritized, personalized notification candidates.
 *
 * Designed to be called from `/api/cron/engagement` once per active user.
 * The cron picks the single highest-priority candidate that hasn't been
 * sent recently and delivers it (respecting quiet hours + prefs).
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';

export type NudgeType =
  | 'habit_session'
  | 'streak_risk'
  | 'streak_milestone'
  | 'comeback'
  | 'social_proof'
  | 'instructor_new_session'
  | 'review_reminder'
  | 'challenge_progress'
  | 'waitlist_demand';

export interface NudgeCandidate {
  userId: string;
  nudgeType: NudgeType;
  message: string;
  messageEs: string;
  actionUrl: string;
  priority: number; // 1-10 higher = more important
  data?: Record<string, unknown>;
}

const MILESTONES = new Set([4, 8, 12, 16, 20, 26, 52]);

function isoWeekKey(d: Date): string {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - (dayNum - 1));
  return copy.toISOString().slice(0, 10);
}

function dayOfWeek(iso: string): number {
  return new Date(iso + 'T00:00:00Z').getUTCDay(); // 0=Sun .. 6=Sat
}

type AttendedSession = {
  session_id: string;
  sessions: {
    date: string;
    sport: string | null;
    creator_id: string | null;
    start_time: string | null;
    title: string | null;
    creator: { name: string | null } | null;
  } | null;
};

async function fetchAttended(supabase: SupabaseClient, userId: string): Promise<AttendedSession[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('session_participants')
    .select(`session_id, sessions:session_id(date, sport, creator_id, start_time, title, creator:creator_id(name))`)
    .eq('user_id', userId)
    .eq('status', 'confirmed');
  if (error) return [];
  return ((data || []) as unknown as AttendedSession[]).filter(
    (r) => r.sessions && r.sessions.date && r.sessions.date <= today
  );
}

function computeStreak(dates: string[]): number {
  if (dates.length === 0) return 0;
  const weeks = new Set<string>();
  for (const d of dates) weeks.add(isoWeekKey(new Date(d + 'T00:00:00Z')));
  const sorted = Array.from(weeks).sort();
  const currentWeek = isoWeekKey(new Date());
  const lastWeek = isoWeekKey(new Date(Date.now() - 7 * 86400000));

  let anchor = sorted.indexOf(currentWeek);
  if (anchor === -1) anchor = sorted.indexOf(lastWeek);
  if (anchor === -1) return 0;

  let streak = 1;
  for (let i = anchor - 1; i >= 0; i--) {
    const prev = new Date(sorted[i] + 'T00:00:00Z').getTime();
    const next = new Date(sorted[i + 1] + 'T00:00:00Z').getTime();
    if (Math.round((next - prev) / (7 * 86400000)) === 1) streak += 1;
    else break;
  }
  return streak;
}

/** Return ordered nudge candidates. Caller picks which to send. */
export async function generateNudgesForUser(supabase: SupabaseClient, userId: string): Promise<NudgeCandidate[]> {
  const candidates: NudgeCandidate[] = [];

  try {
    const attended = await fetchAttended(supabase, userId);
    const dates = attended.map((r) => r.sessions!.date);
    const streak = computeStreak(dates);
    const now = new Date();
    const currentWeek = isoWeekKey(now);
    const daysSinceLast =
      dates.length > 0
        ? Math.floor((now.getTime() - new Date(dates[dates.length - 1] + 'T00:00:00Z').getTime()) / 86400000)
        : Infinity;

    // 1. Streak milestone (just crossed a threshold this week)
    const attendedThisWeek = dates.filter((d) => isoWeekKey(new Date(d + 'T00:00:00Z')) === currentWeek).length;
    if (attendedThisWeek > 0 && MILESTONES.has(streak)) {
      candidates.push({
        userId,
        nudgeType: 'streak_milestone',
        priority: 9,
        message: `🔥 ${streak}-week streak! You're in the top of athletes on Tribe.`,
        messageEs: `🔥 ¡${streak} semanas de racha! Estás entre los mejores atletas de Tribe.`,
        actionUrl: '/my-training',
        data: { streak },
      });
    }

    // 2. Streak risk (>=3 weeks, nothing this week, and it's Thu+)
    const dow = now.getUTCDay(); // 0=Sun..6=Sat
    if (streak >= 3 && attendedThisWeek === 0 && (dow === 0 || dow >= 4)) {
      candidates.push({
        userId,
        nudgeType: 'streak_risk',
        priority: 8,
        message: `Your ${streak}-week streak is at risk! Find a session this weekend.`,
        messageEs: `¡Tu racha de ${streak} semanas está en riesgo! Encuentra una sesión este fin de semana.`,
        actionUrl: '/',
        data: { streak },
      });
    }

    // 3. Habit session: attended same weekday 3+ times in last 6 weeks, and
    //    there's an upcoming session on that weekday this week by any instructor
    //    they've trained with.
    const recentCutoff = new Date(Date.now() - 6 * 7 * 86400000).toISOString().slice(0, 10);
    const weekdayCounts = new Map<number, number>();
    for (const r of attended) {
      const d = r.sessions!.date;
      if (d < recentCutoff) continue;
      const dw = dayOfWeek(d);
      weekdayCounts.set(dw, (weekdayCounts.get(dw) || 0) + 1);
    }
    const habitWeekday = Array.from(weekdayCounts.entries()).find(([, count]) => count >= 3);
    if (habitWeekday) {
      const [habitDow] = habitWeekday;
      const todayIso = now.toISOString().slice(0, 10);
      const weekEndIso = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
      const familiarInstructors = Array.from(
        new Set(attended.map((r) => r.sessions!.creator_id).filter((v): v is string => !!v))
      );
      if (familiarInstructors.length > 0) {
        const { data: upcoming } = await supabase
          .from('sessions')
          .select('id, date, start_time, sport, creator_id, creator:creator_id(name)')
          .in('creator_id', familiarInstructors)
          .eq('status', 'active')
          .gte('date', todayIso)
          .lte('date', weekEndIso);
        type UpcomingRow = {
          id: string;
          date: string;
          start_time: string | null;
          sport: string | null;
          creator_id: string;
          creator: { name: string | null } | null;
        };
        const match = ((upcoming as unknown as UpcomingRow[]) || []).find((s) => dayOfWeek(s.date) === habitDow);
        if (match) {
          candidates.push({
            userId,
            nudgeType: 'habit_session',
            priority: 7,
            message: `${match.creator?.name ?? 'Your instructor'} has a ${match.sport ?? 'training'} session on your regular day.`,
            messageEs: `${match.creator?.name ?? 'Tu instructor'} tiene una sesión de ${match.sport ?? 'entrenamiento'} en tu día habitual.`,
            actionUrl: `/session/${match.id}`,
            data: { sessionId: match.id },
          });
        }
      }
    }

    // 4. Comeback: 14+ days since last session and >=5 total sessions
    if (daysSinceLast >= 14 && dates.length >= 5) {
      const lastInstructorName = attended[attended.length - 1]?.sessions?.creator?.name ?? null;
      candidates.push({
        userId,
        nudgeType: 'comeback',
        priority: 6,
        message: lastInstructorName
          ? `We miss you! ${lastInstructorName} has sessions this week.`
          : 'We miss you! Find a session this week.',
        messageEs: lastInstructorName
          ? `¡Te extrañamos! ${lastInstructorName} tiene sesiones esta semana.`
          : '¡Te extrañamos! Encuentra una sesión esta semana.',
        actionUrl: '/',
      });
    }

    // 5. Review reminder: attended a session ~24h ago but no review yet
    const recent = attended.filter((r) => {
      const d = r.sessions!.date;
      const diffMs = Date.now() - new Date(d + 'T00:00:00Z').getTime();
      return diffMs >= 22 * 3600 * 1000 && diffMs <= 3 * 86400000;
    });
    if (recent.length > 0) {
      const ids = recent.map((r) => r.session_id);
      const { data: reviewed } = await supabase
        .from('reviews')
        .select('session_id')
        .eq('reviewer_id', userId)
        .in('session_id', ids);
      const reviewedSet = new Set(((reviewed || []) as Array<{ session_id: string }>).map((r) => r.session_id));
      const unreviewed = recent.find((r) => !reviewedSet.has(r.session_id));
      if (unreviewed) {
        candidates.push({
          userId,
          nudgeType: 'review_reminder',
          priority: 4,
          message: `How was your session with ${unreviewed.sessions?.creator?.name ?? 'your instructor'}? Leave a quick review.`,
          messageEs: `¿Cómo estuvo tu sesión con ${unreviewed.sessions?.creator?.name ?? 'tu instructor'}? Deja una breve reseña.`,
          actionUrl: `/session/${unreviewed.session_id}`,
        });
      }
    }
  } catch (error) {
    logError(error, { action: 'generateNudgesForUser', userId });
  }

  return candidates.sort((a, b) => b.priority - a.priority);
}
