import { bogotaDateOffset, bogotaToday } from '@/lib/time/bogotaDate';

/**
 * T-MOM1 "Registrar sesión pasada": a session that happened but was never
 * posted, so a shoot there still has a session to attach to. Photos never
 * attach to nothing.
 *
 *   who      a host registers their own (an instructor); an admin may register
 *            one for any listed coach (Al at Salomón's class).
 *   when     today or up to a year back, never the future (that is /create).
 *   quietly  no notifications (the server writes it; no client hooks run), no
 *            feed entry (the feed starts today), and invite_only, so it stays
 *            out of the public view, the site and the coach page.
 */
export type PastSessionInput = {
  sport: string;
  title?: string | null;
  date: string;
  startTime: string;
  duration: number;
  location?: string | null;
  hostId?: string | null;
};

export type PastSessionCheck =
  | { ok: true; row: Record<string, unknown>; hostId: string }
  | {
      ok: false;
      error:
        | 'not_allowed'
        | 'sport_required'
        | 'invalid_date'
        | 'future_date'
        | 'too_old'
        | 'invalid_time'
        | 'invalid_duration'
        | 'invalid_host';
    };

export function checkPastSession(
  input: PastSessionInput,
  actor: { id: string; isAdmin: boolean; isInstructor: boolean },
  hostIsListedCoach: (id: string) => boolean,
  now: Date = new Date()
): PastSessionCheck {
  const forOther = !!input.hostId && input.hostId !== actor.id;
  if (forOther && !actor.isAdmin) return { ok: false, error: 'not_allowed' };
  if (!forOther && !actor.isInstructor && !actor.isAdmin) return { ok: false, error: 'not_allowed' };
  const hostId = forOther ? (input.hostId as string) : actor.id;
  if (forOther && !hostIsListedCoach(hostId)) return { ok: false, error: 'invalid_host' };
  const sport = (input.sport ?? '').trim();
  if (!sport) return { ok: false, error: 'sport_required' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(`${input.date}T00:00:00Z`)))
    return { ok: false, error: 'invalid_date' };
  if (input.date > bogotaToday(now)) return { ok: false, error: 'future_date' };
  if (input.date < bogotaDateOffset(-365, now)) return { ok: false, error: 'too_old' };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime ?? '')) return { ok: false, error: 'invalid_time' };
  const duration = Math.round(Number(input.duration));
  if (!Number.isFinite(duration) || duration < 15 || duration > 600) return { ok: false, error: 'invalid_duration' };
  const title = (input.title ?? '').trim().slice(0, 120) || null;
  return {
    ok: true,
    hostId,
    row: {
      creator_id: hostId,
      sport,
      title,
      date: input.date,
      start_time: `${input.startTime}:00`,
      duration,
      location: (input.location ?? '').trim().slice(0, 300),
      max_participants: 30,
      current_participants: 0,
      status: 'active',
      join_policy: 'invite_only',
      is_paid: false,
      is_test: false,
    },
  };
}
