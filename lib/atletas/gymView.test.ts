/**
 * T-AV26: what the gym dashboard sends to the browser.
 *
 * The exact-key tests are the second layer behind av_athletes_partner_summary
 * dropping bonus fields for coaches: if the function ever leaked one, toGymView
 * still would not forward it, and if toGymView started spreading the RPC row,
 * these fail naming the extra key.
 *
 * Mutation proofs (run by hand, named test goes red):
 *   - `const full = s.role === 'owner' || s.role === 'admin'` -> `const full = true`
 *     -> "coach view: no bonus field and no sales note at any depth"
 *   - spread `...a` into athleteRow -> "owner view: exactly these athlete keys"
 *   - rate(): drop the `whole <= 0` guard -> "rate: nothing to divide by is null"
 */
import { describe, it, expect } from 'vitest';
import type { PartnerSummary, SummaryAthlete, SummaryGuest } from '@/lib/dal/athleteGym';
import { rate, toGymView } from './gymView';

const P = '00000000-0000-4000-8000-000000007000';
const NOW = Date.parse('2026-10-01T12:00:00Z');

const ATHLETE: SummaryAthlete = {
  program_athlete_id: 'pa-1',
  first_name: 'Ana',
  level: 'captain',
  status: 'active',
  ref_code: 'ANA-7KQ',
  started_on: '2026-08-01',
  invited: 9,
  not_credited: 0,
  showed_up: 9,
  joined: 0,
  retained: 0,
  ready_to_promote: false,
  bonus_owed: 1,
  bonus_settled: 2,
  email_lower: 'ana@av.local',
  whatsapp_e164: '+573001112233',
};

const GUEST: SummaryGuest = {
  lead_id: 'lead-1',
  first_name: 'Laura',
  pass_code: 'AV-ANAA',
  claimed_at: '2026-09-29T14:00:00Z',
  attended_at: '2026-09-29T15:00:00Z',
  outcome: 'joined',
  retained_at: null,
  athlete_first_name: 'Ana',
  credited: true,
  no_credit_reason: null,
  bonus_eligible: true,
  bonus_owed: true,
  bonus_settled_at: null,
  contacted_at: '2026-09-30T10:00:00Z',
  retain_from: '2026-09-30T15:00:00Z',
};

const PROGRAM: PartnerSummary['program'] = {
  partner_id: P,
  is_active: true,
  welcome_offer_en: null,
  welcome_offer_es: null,
  showup_reward_en: null,
  showup_reward_es: null,
  class_access_en: null,
  class_access_es: null,
  retention_days: 30,
  promote_at_showups: 10,
  max_athletes: 5,
  pilot_starts_on: null,
  pilot_ends_on: null,
  conversion_bonus_cop: 50000,
  conversion_bonus_note_en: null,
  conversion_bonus_note_es: null,
};

const ownerSummary = (): PartnerSummary => ({
  role: 'owner',
  program: PROGRAM,
  athletes: [ATHLETE],
  guests: [GUEST],
  totals: {
    invited: 26,
    not_credited: 5,
    showed_up: 25,
    joined: 4,
    retained: 1,
    to_close: 19,
    bonus_owed: 2,
    bonus_settled: 1,
  },
});

describe('toGymView: owner and admin', () => {
  it('owner view: exactly these athlete keys (no email, no WhatsApp, no ref code)', () => {
    const v = toGymView(P, ownerSummary(), NOW);
    expect(Object.keys(v.athletes[0]).sort()).toEqual(
      [
        'bonusOwed',
        'bonusPaid',
        'firstName',
        'id',
        'invited',
        'joined',
        'level',
        'readyToPromote',
        'retained',
        'showedUp',
        'status',
      ].sort()
    );
  });

  it('owner view: exactly these guest and funnel keys', () => {
    const v = toGymView(P, ownerSummary(), NOW);
    expect(Object.keys(v.guests[0]).sort()).toEqual(
      [
        'athleteFirstName',
        'attendedAt',
        'bonusOwed',
        'bonusSettledAt',
        'claimedAt',
        'contactedAt',
        'credited',
        'firstName',
        'leadId',
        'noCreditReason',
        'outcome',
        'passCode',
        'retainAvailable',
        'retainFrom',
        'retainedAt',
      ].sort()
    );
    expect(Object.keys(v.funnel).sort()).toEqual(
      [
        'bonusOwed',
        'bonusPaid',
        'invited',
        'joined',
        'rateJoined',
        'rateShowedUp',
        'rateStayed',
        'retained',
        'showedUp',
        'toClose',
      ].sort()
    );
    expect(Object.keys(v).sort()).toEqual(
      ['athletes', 'canManage', 'funnel', 'guests', 'maxAthletes', 'partnerId', 'role'].sort()
    );
  });

  it('every number is the summary field, unchanged', () => {
    const v = toGymView(P, ownerSummary(), NOW);
    expect(v.funnel).toMatchObject({ invited: 26, showedUp: 25, joined: 4, retained: 1, toClose: 19 });
    expect(v.funnel).toMatchObject({ bonusOwed: 2, bonusPaid: 1 });
    expect(v.athletes[0]).toMatchObject({
      invited: 9,
      showedUp: 9,
      joined: 0,
      retained: 0,
      bonusOwed: 1,
      bonusPaid: 2,
    });
    expect(v.maxAthletes).toBe(5);
    expect(v.canManage).toBe(true);
  });

  it('rates divide the summary totals', () => {
    const v = toGymView(P, ownerSummary(), NOW);
    expect(v.funnel.rateShowedUp).toBe(96); // 25 / 26
    expect(v.funnel.rateJoined).toBe(16); // 4 / 25
    expect(v.funnel.rateStayed).toBe(25); // 1 / 4
  });

  it('admin gets the owner view', () => {
    const v = toGymView(P, { ...ownerSummary(), role: 'admin' }, NOW);
    expect(v.canManage).toBe(true);
    expect(v.funnel.bonusOwed).toBe(2);
  });

  it('retain is available exactly from retain_from, not before', () => {
    const before = toGymView(P, ownerSummary(), Date.parse('2026-09-30T14:59:59Z'));
    const at = toGymView(P, ownerSummary(), Date.parse('2026-09-30T15:00:00Z'));
    expect(before.guests[0].retainAvailable).toBe(false);
    expect(at.guests[0].retainAvailable).toBe(true);
    const none = toGymView(P, { ...ownerSummary(), guests: [{ ...GUEST, retain_from: null }] }, NOW);
    expect(none.guests[0].retainAvailable).toBe(false);
  });
});

describe('toGymView: active coach', () => {
  // The function already omits these for a coach. The fixture deliberately
  // INCLUDES them, as if it had leaked, to prove this layer stops them too.
  const coach = (): PartnerSummary => ({ ...ownerSummary(), role: 'coach' });

  it('coach view: no bonus field and no sales note at any depth', () => {
    const v = toGymView(P, coach(), NOW);
    const json = JSON.stringify(v);
    for (const key of [
      'bonusOwed',
      'bonusPaid',
      'bonusSettledAt',
      'contactedAt',
      'retainFrom',
      'retainAvailable',
      'email',
      'whatsapp',
      'conversion',
    ]) {
      expect(json).not.toContain(key);
    }
    expect(v.canManage).toBe(false);
  });

  it('coach view: exactly these keys', () => {
    const v = toGymView(P, coach(), NOW);
    expect(Object.keys(v.funnel).sort()).toEqual(
      ['invited', 'joined', 'rateJoined', 'rateShowedUp', 'rateStayed', 'retained', 'showedUp', 'toClose'].sort()
    );
    expect(Object.keys(v.athletes[0]).sort()).toEqual(
      ['firstName', 'id', 'invited', 'joined', 'level', 'readyToPromote', 'retained', 'showedUp', 'status'].sort()
    );
    expect(Object.keys(v.guests[0]).sort()).toEqual(
      [
        'athleteFirstName',
        'attendedAt',
        'claimedAt',
        'credited',
        'firstName',
        'leadId',
        'noCreditReason',
        'outcome',
        'passCode',
        'retainedAt',
      ].sort()
    );
  });
});

describe('rate', () => {
  it('rate: nothing to divide by is null', () => {
    expect(rate(0, 0)).toBeNull();
    expect(rate(3, 0)).toBeNull();
  });
  it('rounds to a whole percent', () => {
    expect(rate(1, 3)).toBe(33);
    expect(rate(2, 3)).toBe(67);
    expect(rate(0, 5)).toBe(0);
  });
});
