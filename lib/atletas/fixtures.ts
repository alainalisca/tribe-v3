/**
 * Test fixture: one av_athletes_my_summary program entry, TYPED against
 * MySummaryProgram (never cast: CLAUDE.md, a cast fixture hides the fields a
 * function does not read). Shaped like Ana's seeded row.
 */
import type { MySummaryProgram } from '@/lib/dal/athleteHome';

export function summaryProgram(overrides: Partial<MySummaryProgram> = {}): MySummaryProgram {
  return {
    partner_id: 'ccb8502a-893a-474e-aa3c-bbfc339f48a2',
    partner_name: 'BullBox (Prueba)',
    program_active: true,
    program_athlete_id: '00000000-0000-4000-8000-000000002001',
    level: 'captain',
    status: 'active',
    ref_code: 'ANA-7KQ',
    started_on: '2026-08-01',
    welcome_offer_en: 'First month at 20% off if you join this week.',
    welcome_offer_es: 'Primer mes con 20% de descuento si te inscribes esta semana.',
    showup_reward_en: 'One free class for every guest who shows up.',
    showup_reward_es: 'Una clase gratis por cada invitado que llegue.',
    class_access_en: 'Open box, Monday to Saturday.',
    class_access_es: 'Box abierto, de lunes a sábado.',
    conversion_bonus_cop: 50000,
    conversion_bonus_note_en: 'Paid by the gym at the end of each month.',
    conversion_bonus_note_es: 'Lo paga el gimnasio al final de cada mes.',
    counts: { invited: 9, not_credited: 0, showed_up: 9, joined: 0, retained: 0, bonus_owed: 0, bonus_settled: 0 },
    ready_to_promote: false,
    progress: { showups: 9, promote_at: 10 },
    guests: [
      { first_name: 'Andres', claimed_at: '2026-09-28T12:00:00Z', status: 'showed_up', no_credit_reason: null },
      { first_name: 'Caro', claimed_at: '2026-09-25T12:00:00Z', status: 'showed_up', no_credit_reason: 'self_email' },
    ],
    ...overrides,
  };
}
