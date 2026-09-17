'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchSessionsByCreator } from '@/lib/dal';
import { logError } from '@/lib/logger';
import { translateSport } from '@/lib/translations';
import { formatTime12Hour } from '@/lib/utils';

/**
 * T-ATH1 step 8: the upcoming sessions this athlete is HOSTING, shown to a
 * viewer who has trained with them.
 *
 * WHICH "UPCOMING SESSIONS" THIS IS, AND WHY IT IS NOT THE OTHER ONE.
 * There are two readings and only one is buildable today:
 *
 *   HOSTS   -- readable by any authenticated viewer, because sessions a person
 *              runs are already public: they are in the feed, on /i/[id], and on
 *              the gym pages. Measured 2026-09-17: 7 hosts have an upcoming
 *              session, and 12 of 94 athletes have a tier-3 relationship with one
 *              of them, so this renders with real content.
 *   ATTENDS -- NOT readable cross-user. session_participants_roster (152) only
 *              returns sessions the VIEWER is on, so "everything this person is
 *              going to" cannot be queried by anyone else without a new
 *              SECURITY DEFINER RPC. Measured the same day: zero athletes are
 *              confirmed on any upcoming session, so it would render nothing
 *              even if it could be read.
 *
 * SO BE HONEST ABOUT WHAT THE GATE DOES. These sessions are already public. The
 * tier gate here is a decision about PROMINENCE -- surfacing a training partner's
 * plans to someone who has trained with them -- not a privacy control, and it
 * must not be described as one. The reading where the gate would be a real
 * boundary is the attendance one, and that is blocked on an RLS decision.
 */

interface HostedSession {
  id: string;
  title: string | null;
  sport: string | null;
  date: string;
  start_time: string | null;
  status: string | null;
}

const FIELDS = 'id, title, sport, date, start_time, status';

/** Local wall-clock date, matching how sessions.date is stored. */
function todayIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/**
 * Active, dated today or later, soonest first. Exported so the filtering is
 * asserted directly rather than only through a mocked client: fetchSessionsByCreator
 * applies the date floor but has no status filter, so dropping cancelled
 * sessions happens here and is easy to lose in a refactor.
 */
export function selectUpcoming(rows: HostedSession[], today: string = todayIso()): HostedSession[] {
  return rows
    .filter((s) => s.status === 'active' && !!s.date && s.date >= today)
    .sort((a, b) =>
      a.date === b.date ? (a.start_time ?? '').localeCompare(b.start_time ?? '') : a.date.localeCompare(b.date)
    );
}

interface Props {
  userId: string;
  /** From useVisibilityTier. The relation, not the display label -- see that hook. */
  hasTrainedTogether: boolean;
  language: 'en' | 'es';
  heading: string;
}

export default function ProfileUpcomingSessions({ userId, hasTrainedTogether, language, heading }: Props) {
  const [sessions, setSessions] = useState<HostedSession[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!hasTrainedTogether) {
      setSessions(null);
      return;
    }

    const supabase = createClient();
    fetchSessionsByCreator(supabase, userId, { dateGte: todayIso(), fields: FIELDS })
      .then((result) => {
        if (cancelled) return;
        if (!result.success) {
          // Never render an empty list on a failed read: "hosts nothing" and
          // "the query failed" are different statements and only one of them is
          // ours to make.
          logError(new Error(result.error ?? 'fetchSessionsByCreator failed'), {
            action: 'ProfileUpcomingSessions',
            userId,
          });
          setSessions(null);
          return;
        }
        setSessions(selectUpcoming((result.data ?? []) as HostedSession[]));
      })
      .catch((error) => {
        logError(error, { action: 'ProfileUpcomingSessions', userId });
        if (!cancelled) setSessions(null);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, hasTrainedTogether]);

  // Not entitled, still loading, or the read failed: render nothing at all
  // rather than an empty state, which would tell a stranger that this athlete
  // has no plans -- a fact they are not entitled to either.
  if (!hasTrainedTogether || !sessions || sessions.length === 0) return null;

  return (
    <div className="bg-white dark:bg-tribe-card rounded-xl p-6 shadow-lg" data-testid="profile-upcoming-sessions">
      <h2 className="text-lg font-bold text-stone-900 dark:text-white mb-4 flex items-center gap-2">
        <Calendar className="w-5 h-5 text-tribe-green-dark" aria-hidden="true" />
        {heading}
      </h2>
      <ul className="space-y-2">
        {sessions.map((s) => (
          <li key={s.id}>
            <Link
              href={`/session/${s.id}`}
              className="flex items-center justify-between p-3 bg-stone-50 dark:bg-tribe-mid rounded-lg"
            >
              <span className="font-medium text-stone-900 dark:text-white">
                {s.title || translateSport(s.sport ?? '', language)}
              </span>
              <span className="text-sm text-muted-foreground">
                {new Date(`${s.date}T00:00:00`).toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
                {s.start_time ? ` · ${formatTime12Hour(s.start_time)}` : ''}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
