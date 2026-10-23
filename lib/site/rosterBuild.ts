/**
 * T-SITE1.1 Part C. The live coach roster: the rules that turn the last 60
 * days of public sessions into the cards on Inicio and Coaches. Pure, so every
 * rule is a unit test; the query and the cache live in lib/site/roster.ts.
 *
 * The rules (Al, T-SITE1.1):
 * - A coach is a listed instructor (users.is_instructor; never admins, test
 *   accounts, banned or deleted, the board's own rule) with at least one active,
 *   public session dated in the last 60 days (or later).
 * - Primary sport: the sport of most of their sessions ("Other" only if it is
 *   all they teach).
 * - Place: the partner gym most of their sessions are hosted at, when it is an
 *   approved, active partner; else nothing. Never the profile's barrio
 *   (users.location): Al, 2026-10-17, same as the board.
 * - Order: sessions in the last 30 days, most first; then the newest coach.
 * - Name: first name and last initial. The card links to /i/<id>/, the public
 *   coach page, which needs no sign-in.
 */
import { addDays } from './rosterDates';
import { firstName, isListedCreator, shortName, type BoardSessionRow } from './weekBoard';

export const ROSTER_WINDOW_DAYS = 60;
export const ROSTER_ACTIVITY_DAYS = 30;
export const ROSTER_HOME_MAX = 12;

/**
 * Site polish (Al, 2026-10-23). Columns for n cards that leave the last row as
 * full as possible: the fewest rows that fit `max` per row, then as few
 * columns as fill them. 9 coaches at 6 across is 6 + 3; balanced it is 5 + 4.
 */
export function balancedColumns(n: number, max: number): number {
  if (n <= 0) return 1;
  return Math.ceil(n / Math.ceil(n / max));
}

/** The columns lib/site/roster.ts selects. */
export type RosterSessionRow = {
  sport: string | null;
  date: string;
  status: string | null;
  partner_status: string | null;
  partner: { business_name: string | null; status: string | null } | null;
  creator:
    | (NonNullable<BoardSessionRow['creator']> & { is_instructor: boolean | null; created_at: string | null })
    | null;
};

/** One card. Every field is public. */
export type RosterCoach = {
  id: string;
  /** "Andrés V." */
  name: string;
  /** "AV", for the card without a photo. */
  initials: string;
  avatarUrl: string | null;
  /** Sport key as stored (e.g. "Boxing"); translated for display. Null when unknown. */
  sport: string | null;
  /** Approved partner gym, else null. */
  place: string | null;
  /** Sessions dated in the last 30 days, today included. For the order only. */
  recent: number;
  /** /i/<id>/: the public coach page. */
  href: string;
};

/** "Andrés Varón" -> "AV"; "Lissete" -> "L". */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0].toLocaleUpperCase('es'))
    .join('');
}

/** The key with the highest count; ties go to the one seen first. */
function mostFrequent(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let n = 0;
  for (const [k, c] of counts) if (c > n) [best, n] = [k, c];
  return best;
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** Every coach card, in roster order. `today` is the Bogotá date, YYYY-MM-DD. */
export function buildRoster(rows: readonly RosterSessionRow[], today: string): RosterCoach[] {
  const since = addDays(today, -ROSTER_WINDOW_DAYS);
  const recentSince = addDays(today, -ROSTER_ACTIVITY_DAYS);
  type Acc = {
    creator: NonNullable<RosterSessionRow['creator']>;
    sports: Map<string, number>;
    places: Map<string, number>;
    recent: number;
  };
  const byCoach = new Map<string, Acc>();
  for (const r of rows) {
    if (r.status !== 'active' || r.date < since) continue;
    const c = r.creator;
    if (!isListedCreator(c) || !c.is_instructor) continue;
    const acc = byCoach.get(c.id) ?? { creator: c, sports: new Map(), places: new Map(), recent: 0 };
    if (r.sport) bump(acc.sports, r.sport);
    const partner =
      r.partner_status === 'approved' && r.partner?.status === 'active' ? r.partner.business_name?.trim() : null;
    if (partner) bump(acc.places, partner);
    if (r.date >= recentSince && r.date <= today) acc.recent += 1;
    byCoach.set(c.id, acc);
  }

  const coaches = [...byCoach.values()].map(({ creator, sports, places, recent }) => {
    const realSports = new Map([...sports].filter(([s]) => s !== 'Other'));
    return {
      coach: {
        id: creator.id,
        name: shortName(creator.name) || firstName(creator.name),
        initials: initialsOf(creator.name),
        avatarUrl: creator.avatar_url,
        sport: mostFrequent(realSports.size ? realSports : sports),
        place: mostFrequent(places),
        recent,
        href: `/i/${creator.id}/`,
      } satisfies RosterCoach,
      joined: creator.created_at ?? '',
    };
  });

  return coaches
    .sort((a, b) => b.coach.recent - a.coach.recent || b.joined.localeCompare(a.joined))
    .map((c) => c.coach);
}
