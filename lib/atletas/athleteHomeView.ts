/**
 * T-AV24. What /atletas/ hands to its client components, built FIELD BY
 * FIELD from the athlete's own summary.
 *
 * Why an allowlist and not the RPC result: everything passed to a client
 * component is serialized into the RSC payload, so a field that exists in
 * av_athletes_my_summary would reach the browser the day it was added,
 * without anyone deciding it should. athleteHomeView.test.ts pins the exact
 * key set, so adding a field here is a deliberate, reviewed act.
 *
 * Deliberately absent: program_athlete_id, partner_id, the welcome offer (it
 * is the gym's offer to guests), not_credited, bonus_owed and bonus_settled
 * (the gym's ledger, not the athlete's numbers).
 */
import type { AthleteLevel, GuestStatus, MySummaryProgram } from '@/lib/dal/athleteHome';

export interface AthleteGuestView {
  firstName: string;
  claimedAt: string;
  status: GuestStatus;
  noCreditReason: string | null;
}

export interface AthleteMemberView {
  state: 'member';
  partnerName: string;
  firstName: string | null;
  avatarUrl: string | null;
  level: AthleteLevel;
  /** Decision 1 (2026-09-30): paused, ended or program off: no link, no QR. */
  linkActive: boolean;
  link: string | null;
  qrSvg: string | null;
  counts: { invited: number; showedUp: number; joined: number; stayed: number };
  progress: { showups: number; promoteAt: number };
  readyToPromote: boolean;
  guests: AthleteGuestView[];
  rewards: {
    showupEn: string | null;
    showupEs: string | null;
    classAccessEn: string | null;
    classAccessEs: string | null;
    /** Decision 2: only at levels athlete and sponsored; null for a captain. */
    bonusCop: number | null;
    bonusNoteEn: string | null;
    bonusNoteEs: string | null;
  };
}

export type AthleteHomeView = { state: 'none' } | AthleteMemberView;

/** Is the athlete's link live: their row active AND the gym's program on. */
export function isLinkActive(program: Pick<MySummaryProgram, 'status' | 'program_active'>): boolean {
  return program.status === 'active' && program.program_active === true;
}

/** The link shape T-AV23 resolves: /pase/{slug}/?src=atleta&code={ref_code}. */
export function buildAthleteLink(origin: string, slug: string, refCode: string): string {
  return `${origin}/pase/${encodeURIComponent(slug)}/?src=atleta&code=${encodeURIComponent(refCode)}`;
}

/** WhatsApp's share-to-anyone URL. The whole message is one encoded value. */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function toAthleteHomeView(
  program: MySummaryProgram,
  extras: { link: string | null; qrSvg: string | null; firstName: string | null; avatarUrl: string | null }
): AthleteMemberView {
  const linkActive = isLinkActive(program) && extras.link !== null;
  const earnsBonus = program.level === 'athlete' || program.level === 'sponsored';
  return {
    state: 'member',
    partnerName: program.partner_name,
    firstName: extras.firstName,
    avatarUrl: extras.avatarUrl,
    level: program.level,
    linkActive,
    link: linkActive ? extras.link : null,
    qrSvg: linkActive ? extras.qrSvg : null,
    counts: {
      invited: program.counts.invited,
      showedUp: program.counts.showed_up,
      joined: program.counts.joined,
      stayed: program.counts.retained,
    },
    progress: { showups: program.progress.showups, promoteAt: program.progress.promote_at },
    readyToPromote: program.ready_to_promote === true,
    guests: program.guests.map((g) => ({
      firstName: g.first_name ?? '',
      claimedAt: g.claimed_at,
      status: g.status,
      noCreditReason: g.no_credit_reason,
    })),
    rewards: {
      showupEn: program.showup_reward_en,
      showupEs: program.showup_reward_es,
      classAccessEn: program.class_access_en,
      classAccessEs: program.class_access_es,
      bonusCop: earnsBonus ? program.conversion_bonus_cop : null,
      bonusNoteEn: earnsBonus ? program.conversion_bonus_note_en : null,
      bonusNoteEs: earnsBonus ? program.conversion_bonus_note_es : null,
    },
  };
}
