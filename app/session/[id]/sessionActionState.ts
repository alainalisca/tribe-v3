/**
 * T-UI-SD1: what the sticky bar at the bottom of the signed-in session page
 * offers. One primary action per role:
 *
 *   host     "Compartir" (upcoming), plus "Gestionar" for everything else.
 *   athlete  "Reservar" / "Solicitar unirse" (paid), then "Ya estás dentro"
 *            with "Cancelar mi cupo"; a pending request says so and can be
 *            withdrawn; full, ended and invite-only sessions say why there is
 *            nothing to press.
 *
 * A cancelled session has no bar: nothing to book and nothing to manage
 * (T-JOIN1b, the page's notice points at the host's other sessions).
 */
export type AthleteBarState = 'book' | 'request' | 'pending' | 'joined' | 'full' | 'ended' | 'invite_only';

export function athleteBarState(s: {
  hasJoined: boolean;
  isPending: boolean;
  isPast: boolean;
  isFull: boolean;
  isPaid: boolean;
  joinPolicy: string | null | undefined;
}): AthleteBarState {
  if (s.isPending) return 'pending';
  if (s.hasJoined) return s.isPast ? 'ended' : 'joined';
  if (s.isPast) return 'ended';
  if (s.isFull) return 'full';
  if (s.joinPolicy === 'invite_only') return 'invite_only';
  return s.isPaid ? 'request' : 'book';
}

/**
 * When the host's door list ("Quién llegó") shows: from the start time
 * onward, including after the session ends, so the host can still add who
 * came once it is over. Never before the start.
 */
export function doorListOpen(s: { date: string; start_time: string }, now: Date = new Date()): boolean {
  const start = new Date(`${s.date}T${s.start_time}`);
  return !Number.isNaN(start.getTime()) && now >= start;
}

/** Room the fixed bar takes at the bottom of the page, so it never covers content. */
export const ACTION_BAR_CLEARANCE = 'calc(6.5rem + var(--safe-area-inset-bottom, 0px))';
