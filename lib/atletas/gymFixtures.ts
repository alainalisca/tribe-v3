/**
 * T-AV26 test fixtures: av_athletes_partner_summary rows, TYPED against the
 * DAL's interfaces (never cast: CLAUDE.md). Shaped like the local seed's
 * BullBox (Prueba): Ana a captain at 9 of 10, Beto a ready captain, Caro an
 * athlete with a join that owes a bonus.
 */
import type { PartnerSummary, SummaryAthlete, SummaryGuest } from '@/lib/dal/athleteGym';

export const GYM_PARTNER_ID = '00000000-0000-4000-8000-000000007000';

export function gymAthlete(o: Partial<SummaryAthlete> = {}): SummaryAthlete {
  return {
    program_athlete_id: '00000000-0000-4000-8000-000000002001',
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
    bonus_owed: 0,
    bonus_settled: 0,
    email_lower: 'ana@av.local',
    whatsapp_e164: '+573005551001',
    ...o,
  };
}

export function gymGuest(o: Partial<SummaryGuest> = {}): SummaryGuest {
  return {
    lead_id: '00000000-0000-4000-8000-000000003001',
    first_name: 'Laura',
    pass_code: 'AV-CARB',
    claimed_at: '2026-09-23T14:00:00Z',
    attended_at: '2026-09-24T14:00:00Z',
    outcome: null,
    retained_at: null,
    athlete_first_name: 'Caro',
    credited: true,
    no_credit_reason: null,
    bonus_eligible: false,
    bonus_owed: false,
    bonus_settled_at: null,
    contacted_at: null,
    retain_from: null,
    ...o,
  };
}

export function gymSummary(o: Partial<PartnerSummary> = {}): PartnerSummary {
  return {
    role: 'owner',
    program: {
      partner_id: GYM_PARTNER_ID,
      is_active: true,
      welcome_offer_en: 'First month at 20% off if you join this week.',
      welcome_offer_es: 'Primer mes con 20% de descuento si te inscribes esta semana.',
      showup_reward_en: 'One free class for every guest who shows up.',
      showup_reward_es: 'Una clase gratis por cada invitado que llegue.',
      class_access_en: 'Open box, Monday to Saturday.',
      class_access_es: 'Box abierto, de lunes a sábado.',
      retention_days: 30,
      promote_at_showups: 10,
      max_athletes: 5,
      pilot_starts_on: '2026-09-17',
      pilot_ends_on: '2026-10-29',
      conversion_bonus_cop: 50000,
      conversion_bonus_note_en: 'Paid by the gym at the end of each month.',
      conversion_bonus_note_es: 'Lo paga el gimnasio al final de cada mes.',
    },
    athletes: [
      gymAthlete(),
      gymAthlete({
        program_athlete_id: '00000000-0000-4000-8000-000000002002',
        first_name: 'Beto',
        ref_code: 'BETO-M3X',
        invited: 10,
        showed_up: 10,
        joined: 1,
        ready_to_promote: true,
      }),
      gymAthlete({
        program_athlete_id: '00000000-0000-4000-8000-000000002003',
        first_name: 'Caro',
        level: 'athlete',
        ref_code: 'CARO-P9R',
        invited: 7,
        not_credited: 5,
        showed_up: 6,
        joined: 3,
        retained: 1,
        bonus_owed: 2,
        bonus_settled: 1,
      }),
    ],
    guests: [
      gymGuest({ lead_id: 'g-claimed', first_name: 'Lucia', pass_code: 'AV-CARA', attended_at: null }),
      gymGuest(),
      gymGuest({
        lead_id: 'g-joined',
        first_name: 'Nico',
        pass_code: 'AV-CARC',
        outcome: 'joined',
        bonus_eligible: true,
        bonus_owed: true,
        retain_from: '2026-10-26T10:00:00Z',
      }),
      gymGuest({
        lead_id: 'g-ready',
        first_name: 'Pedro',
        pass_code: 'AV-CARD',
        outcome: 'joined',
        bonus_eligible: true,
        retain_from: '2026-09-21T10:00:00Z',
        bonus_settled_at: '2026-09-25T10:00:00Z',
      }),
      gymGuest({
        lead_id: 'g-self',
        first_name: 'Ana',
        pass_code: 'AV-CARE',
        credited: false,
        no_credit_reason: 'self_email',
      }),
    ],
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
    ...o,
  };
}

/** The same summary as an active coach receives it: no bonus field, no sales note. */
export function gymCoachSummary(): PartnerSummary {
  const s = gymSummary({ role: 'coach' });
  const program = { ...s.program };
  delete program.conversion_bonus_cop;
  delete program.conversion_bonus_note_en;
  delete program.conversion_bonus_note_es;
  const totals = { ...s.totals };
  delete totals.bonus_owed;
  delete totals.bonus_settled;
  return {
    ...s,
    program,
    athletes: s.athletes.map((a) => {
      const c = { ...a };
      delete c.bonus_owed;
      delete c.bonus_settled;
      delete c.email_lower;
      delete c.whatsapp_e164;
      return c;
    }),
    guests: s.guests.map((g) => {
      const c = { ...g };
      delete c.bonus_eligible;
      delete c.bonus_owed;
      delete c.bonus_settled_at;
      delete c.contacted_at;
      delete c.retain_from;
      return c;
    }),
    totals,
  };
}
