/**
 * T-AV26. What the gym dashboard sends to the browser, built field by field
 * from av_athletes_partner_summary (207), as toAthleteHomeView does for the
 * athlete (T-AV24).
 *
 * AN ALLOWLIST. Nothing from the RPC result is spread into the view; every key
 * is named here. gymView.test.ts pins the exact key set for the owner view and
 * for the coach view, so a field added to the function later does not reach
 * the browser by accident, and a coach view can never carry a bonus field or
 * a sales note. (The function already drops them for coaches; this is the
 * second layer.) The athletes' email and WhatsApp are never forwarded.
 *
 * NOTHING IS COUNTED HERE. Every number is a field of the summary; the only
 * arithmetic is rate(), which divides two of the summary's own totals.
 */
import type { AthleteLevel } from '@/lib/dal/athleteHome';
import type { DoorOutcome } from '@/lib/dal/passDoor';
import type { AthleteStatus, PartnerRole, PartnerSummary, SummaryAthlete, SummaryGuest } from '@/lib/dal/athleteGym';

/** Whole percent of `part` over `whole`, or null when there is nothing to divide by. */
export function rate(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return Math.round((100 * part) / whole);
}

export interface GymFunnel {
  invited: number;
  showedUp: number;
  joined: number;
  retained: number;
  toClose: number;
  rateShowedUp: number | null;
  rateJoined: number | null;
  rateStayed: number | null;
  /** Owner and admin only. */
  bonusOwed?: number;
  bonusPaid?: number;
}

export interface GymAthleteRow {
  id: string;
  firstName: string;
  level: AthleteLevel;
  status: AthleteStatus;
  invited: number;
  showedUp: number;
  joined: number;
  retained: number;
  readyToPromote: boolean;
  /** Owner and admin only. */
  bonusOwed?: number;
  bonusPaid?: number;
}

export type GuestFilter = 'open' | 'expected' | 'came' | 'members' | 'all';

/** T-AV27a: the Invitados list opens on this filter, 20 rows at a time. */
export const DEFAULT_GUEST_FILTER: GuestFilter = 'open';
export const GUESTS_PAGE_SIZE = 20;

export interface GymGuestRow {
  leadId: string;
  firstName: string;
  passCode: string;
  claimedAt: string;
  attendedAt: string | null;
  outcome: DoorOutcome | null;
  retainedAt: string | null;
  athleteFirstName: string;
  credited: boolean;
  noCreditReason: string | null;
  /** Owner and admin only, from here down. */
  contactedAt?: string | null;
  retainFrom?: string | null;
  /** retain_from has passed: "Marcar como sigue" is offered. */
  retainAvailable?: boolean;
  bonusOwed?: boolean;
  bonusSettledAt?: string | null;
}

export interface GymView {
  partnerId: string;
  role: PartnerRole;
  /** Owner or admin: actions, bonus fields and the settings tab. */
  canManage: boolean;
  maxAthletes: number;
  funnel: GymFunnel;
  athletes: GymAthleteRow[];
  guests: GymGuestRow[];
}

function athleteRow(a: SummaryAthlete, full: boolean): GymAthleteRow {
  const row: GymAthleteRow = {
    id: a.program_athlete_id,
    firstName: a.first_name,
    level: a.level,
    status: a.status,
    invited: a.invited,
    showedUp: a.showed_up,
    joined: a.joined,
    retained: a.retained,
    readyToPromote: a.ready_to_promote === true,
  };
  if (full) {
    row.bonusOwed = a.bonus_owed ?? 0;
    row.bonusPaid = a.bonus_settled ?? 0;
  }
  return row;
}

function guestRow(g: SummaryGuest, full: boolean, now: number): GymGuestRow {
  const row: GymGuestRow = {
    leadId: g.lead_id,
    firstName: g.first_name ?? '',
    passCode: g.pass_code,
    claimedAt: g.claimed_at,
    attendedAt: g.attended_at,
    outcome: g.outcome,
    retainedAt: g.retained_at,
    athleteFirstName: g.athlete_first_name,
    credited: g.credited === true,
    noCreditReason: g.no_credit_reason,
  };
  if (full) {
    const retainFrom = g.retain_from ?? null;
    row.contactedAt = g.contacted_at ?? null;
    row.retainFrom = retainFrom;
    row.retainAvailable = retainFrom !== null && Date.parse(retainFrom) <= now;
    row.bonusOwed = g.bonus_owed === true;
    row.bonusSettledAt = g.bonus_settled_at ?? null;
  }
  return row;
}

/** `now` is injected so the "retain available" cut is testable. */
export function toGymView(partnerId: string, s: PartnerSummary, now: number = Date.now()): GymView {
  const full = s.role === 'owner' || s.role === 'admin';
  const t = s.totals;
  const funnel: GymFunnel = {
    invited: t.invited,
    showedUp: t.showed_up,
    joined: t.joined,
    retained: t.retained,
    toClose: t.to_close,
    rateShowedUp: rate(t.showed_up, t.invited),
    rateJoined: rate(t.joined, t.showed_up),
    rateStayed: rate(t.retained, t.joined),
  };
  if (full) {
    funnel.bonusOwed = t.bonus_owed ?? 0;
    funnel.bonusPaid = t.bonus_settled ?? 0;
  }
  return {
    partnerId,
    role: s.role,
    canManage: full,
    maxAthletes: s.program.max_athletes,
    funnel,
    athletes: s.athletes.map((a) => athleteRow(a, full)),
    guests: s.guests.map((g) => guestRow(g, full, now)),
  };
}

/** Which guests a filter chip shows. Reads the summary's own fields; counts nothing. */
export function matchesGuestFilter(g: GymGuestRow, filter: GuestFilter): boolean {
  switch (filter) {
    case 'open':
      return g.outcome === null;
    case 'expected':
      return g.attendedAt === null;
    case 'came':
      return g.attendedAt !== null;
    case 'members':
      return g.outcome === 'joined';
    default:
      return true;
  }
}

/**
 * T-AV27a (Al, 2026-10-01). The rows a filter shows, in display order.
 *
 * "Abiertos" (the default) puts the guests who CAME and have no outcome yet
 * first, because those are the ones the gym can still close, then the guests
 * not yet arrived. Each group keeps the summary's own order, newest claim
 * first. Every other filter keeps that order unchanged. Nothing is counted.
 */
export function guestsForFilter(guests: readonly GymGuestRow[], filter: GuestFilter): GymGuestRow[] {
  const rows = guests.filter((g) => matchesGuestFilter(g, filter));
  if (filter !== 'open') return rows;
  return [...rows.filter((g) => g.attendedAt !== null), ...rows.filter((g) => g.attendedAt === null)];
}
