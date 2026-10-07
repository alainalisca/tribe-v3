/**
 * T-AV26 and T-AV27a: "Invitados", in Spanish.
 *
 * T-AV27a (Al, 2026-10-01): the list opens on "Abiertos" (came with no
 * outcome first, then not yet arrived), 20 rows at a time with "Ver más", and
 * the outcome buttons sit behind "Registrar resultado", one guest at a time.
 *
 * Mutation proofs (driver: the T-AV27a unit arms):
 *   - default filter 'all' instead of 'open' -> "opens on Abiertos"
 *   - drop the slice to 20 -> "20 rows, then Ver más adds the next 20"
 *   - render DoorOutcomeButtons without the open check -> "outcomes stay behind Registrar resultado"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toGymView } from '@/lib/atletas/gymView';
import { GYM_PARTNER_ID, gymGuest, gymSummary } from '@/lib/atletas/gymFixtures';

const h = vi.hoisted(() => ({
  refresh: vi.fn(),
  retained: vi.fn(),
  bonus: vi.fn(),
  contacted: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: h.refresh, push: vi.fn() }) }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es' }) }));
vi.mock('@/components/BottomNav', () => ({ default: () => null }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/dal/athleteGymWrites', () => ({
  addProgramAthlete: vi.fn(),
  setProgramAthleteStatus: vi.fn(),
  setProgramAthleteLevel: vi.fn(),
  markLeadRetained: h.retained,
  markLeadBonusSettled: h.bonus,
}));
vi.mock('@/lib/dal/leadContact', () => ({ setPassLeadContacted: h.contacted }));

import GymDashboard from './GymDashboard';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const owner = () => toGymView(GYM_PARTNER_ID, gymSummary(), NOW);
const guests = (c: HTMLElement) =>
  [...c.querySelectorAll('[data-guest-row]')].map((r) => r.getAttribute('data-guest-row'));
const row = (c: HTMLElement, code: string) => c.querySelector(`[data-guest-row="${code}"]`) as HTMLElement;

function open(view = owner()) {
  const r = render(<GymDashboard view={view} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Invitados' }));
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [h.retained, h.bonus, h.contacted]) fn.mockResolvedValue({ success: true, data: {} });
});

describe('Invitados: the default view', () => {
  it('opens on Abiertos: came with no outcome first, then not yet arrived; no closed guest', () => {
    const { container } = open();
    expect(screen.getByText('Abiertos').getAttribute('aria-pressed')).toBe('true');
    // Fixture: CARB came, CARE came (self-referral), CARA not yet; CARC and CARD joined.
    expect(guests(container)).toEqual(['AV-CARB', 'AV-CARE', 'AV-CARA']);
  });

  it('the other filters select rows without counting them, in the summary order', () => {
    const { container } = open();
    fireEvent.click(screen.getByText('Por llegar'));
    expect(guests(container)).toEqual(['AV-CARA']);
    fireEvent.click(screen.getByText('Miembros'));
    expect(guests(container)).toEqual(['AV-CARC', 'AV-CARD']);
    fireEvent.click(screen.getByText('Llegaron'));
    expect(guests(container)).toEqual(['AV-CARB', 'AV-CARC', 'AV-CARD', 'AV-CARE']);
    fireEvent.click(screen.getByText('Todos'));
    expect(guests(container)).toEqual(['AV-CARA', 'AV-CARB', 'AV-CARC', 'AV-CARD', 'AV-CARE']);
  });

  it('20 rows, then Ver más adds the next 20, and a filter change starts again at 20', () => {
    const many = Array.from({ length: 45 }, (_, i) =>
      gymGuest({ lead_id: `l${i}`, pass_code: `AV-${String(i).padStart(4, '0')}`, attended_at: null })
    );
    const { container } = open(toGymView(GYM_PARTNER_ID, gymSummary({ guests: many }), NOW));
    expect(guests(container)).toHaveLength(20);
    fireEvent.click(screen.getByText('Ver más'));
    expect(guests(container)).toHaveLength(40);
    fireEvent.click(screen.getByText('Ver más'));
    expect(guests(container)).toHaveLength(45);
    expect(screen.queryByText('Ver más')).toBeNull();
    fireEvent.click(screen.getByText('Todos'));
    expect(guests(container)).toHaveLength(20);
  });

  it('outcomes stay behind Registrar resultado, one guest open at a time', () => {
    const { container } = open();
    expect(container.querySelector('[data-outcomes]')).toBeNull();
    // Not yet arrived: nothing to record.
    expect(row(container, 'AV-CARA').querySelector('[data-action="record-outcome"]')).toBeNull();
    fireEvent.click(row(container, 'AV-CARB').querySelector('[data-action="record-outcome"]') as HTMLElement);
    expect(row(container, 'AV-CARB').querySelector('[data-outcomes]')).toBeTruthy();
    fireEvent.click(row(container, 'AV-CARE').querySelector('[data-action="record-outcome"]') as HTMLElement);
    expect(row(container, 'AV-CARB').querySelector('[data-outcomes]')).toBeNull();
    expect(row(container, 'AV-CARE').querySelector('[data-outcomes]')).toBeTruthy();
    expect(screen.getAllByText('Registrar resultado')).toHaveLength(2);
  });
});

describe('Invitados: per-row facts and actions (T-AV26)', () => {
  it('a self-referral shows the gym-facing reason', () => {
    const { container } = open();
    expect(row(container, 'AV-CARE').querySelector('[data-guest-status]')?.textContent).toBe(
      'Usó el correo del atleta'
    );
  });

  it('"Oferta enviada" goes through set_pass_lead_contacted, the existing writer', async () => {
    const { container } = open();
    fireEvent.click(row(container, 'AV-CARB').querySelector('[data-action="offer-sent"]') as HTMLElement);
    await waitFor(() =>
      expect(h.contacted).toHaveBeenCalledWith(expect.anything(), '00000000-0000-4000-8000-000000003001', true)
    );
    expect(h.refresh).toHaveBeenCalled();
  });

  it('"Marcar como sigue" only once retain_from has passed; before that, the date', async () => {
    const { container } = open();
    fireEvent.click(screen.getByText('Miembros'));
    const early = row(container, 'AV-CARC');
    expect(early.querySelector('[data-action="retained"]')).toBeNull();
    expect(early.querySelector('[data-retain-from]')?.textContent).toMatch(/^Disponible desde el /);
    fireEvent.click(row(container, 'AV-CARD').querySelector('[data-action="retained"]') as HTMLElement);
    await waitFor(() => expect(h.retained).toHaveBeenCalledWith(expect.anything(), 'g-ready'));
  });

  it('"Bono pagado" for a join that owes a bonus; a settled one shows its date instead', async () => {
    const { container } = open();
    fireEvent.click(screen.getByText('Todos'));
    fireEvent.click(row(container, 'AV-CARC').querySelector('[data-action="bonus-paid"]') as HTMLElement);
    await waitFor(() => expect(h.bonus).toHaveBeenCalledWith(expect.anything(), 'g-joined'));
    expect(row(container, 'AV-CARD').querySelector('[data-action="bonus-paid"]')).toBeNull();
    expect(row(container, 'AV-CARD').querySelector('[data-bonus-settled]')?.textContent).toMatch(/^Bono pagado · /);
    expect(row(container, 'AV-CARB').querySelector('[data-action="bonus-paid"]')).toBeNull();
  });
});
