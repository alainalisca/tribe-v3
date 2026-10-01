/**
 * T-AV26: the gym dashboard renders the view it is given, in Spanish.
 *
 * Owner: every tab, every action, the bonus counts, the settings link.
 * Coach: the same tabs, the door link, and no button, no bonus count and no
 * settings link anywhere (the settings PAGE is a real 404 in middleware; this
 * is the UI half).
 *
 * Mutation proofs (run by hand, named test goes red):
 *   - GymAthletes: render the actions without `canManage` -> "coach: no action anywhere"
 *   - GymAthletes: show Promote for every captain -> "Promote only for the ready captain"
 *   - GymAddAthlete: skip normalizeWhatsApp -> "a WhatsApp is normalized to E.164 before av_athletes_add"
 *   - GymAddAthlete: drop the invalid-number return -> "an unusable WhatsApp is refused with no request"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { toGymView } from '@/lib/atletas/gymView';
import { GYM_PARTNER_ID, gymCoachSummary, gymSummary } from '@/lib/atletas/gymFixtures';

const h = vi.hoisted(() => ({
  refresh: vi.fn(),
  search: vi.fn(),
  add: vi.fn(),
  status: vi.fn(),
  level: vi.fn(),
  retained: vi.fn(),
  bonus: vi.fn(),
  contacted: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: h.refresh, push: vi.fn() }) }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es' }) }));
vi.mock('@/components/BottomNav', () => ({ default: () => null }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/dal/athleteGym', async (orig) => ({
  ...(await orig<typeof import('@/lib/dal/athleteGym')>()),
  searchAthleteCandidates: h.search,
}));
vi.mock('@/lib/dal/athleteGymWrites', () => ({
  addProgramAthlete: h.add,
  setProgramAthleteStatus: h.status,
  setProgramAthleteLevel: h.level,
  markLeadRetained: h.retained,
  markLeadBonusSettled: h.bonus,
}));
vi.mock('@/lib/dal/leadContact', () => ({ setPassLeadContacted: h.contacted }));

import GymDashboard from './GymDashboard';
import GymAthletes from './GymAthletes';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const owner = () => toGymView(GYM_PARTNER_ID, gymSummary(), NOW);
const coach = () => toGymView(GYM_PARTNER_ID, gymCoachSummary(), NOW);
const tab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }));
// next.config's trailingSlash is not loaded under vitest, so Link drops the slash.
const href = (el: Element | null) => el?.getAttribute('href')?.replace(/\/$/, '');
const value = (c: HTMLElement, key: string) => c.querySelector(`[data-funnel="${key}"]`)?.getAttribute('data-value');

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [h.add, h.status, h.level, h.retained, h.bonus, h.contacted]) {
    fn.mockResolvedValue({ success: true, data: {} });
  }
});

describe('GymDashboard: Resumen', () => {
  it('the funnel, the rates and "Por cerrar", straight from the summary', () => {
    const { container } = render(<GymDashboard view={owner()} />);
    expect(['invited', 'showed_up', 'joined', 'retained', 'to_close'].map((k) => value(container, k))).toEqual([
      '26',
      '25',
      '4',
      '1',
      '19',
    ]);
    expect(screen.getByText('96% de los invitados')).toBeTruthy();
    expect(screen.getByText('16% de los que llegaron')).toBeTruthy();
    expect(screen.getByText('25% de los nuevos miembros')).toBeTruthy();
    expect(screen.getByText('Por cerrar')).toBeTruthy();
    expect([value(container, 'bonus_owed'), value(container, 'bonus_paid')]).toEqual(['2', '1']);
  });

  it('links to the door list, which had no entry point before', () => {
    const { container } = render(<GymDashboard view={coach()} />);
    expect(href(container.querySelector('[data-door-link]'))).toBe(`/atletas/gym/${GYM_PARTNER_ID}/puerta`);
    expect(screen.getByText('Abrir la lista de la puerta')).toBeTruthy();
  });

  it('owner: the settings link and the money note; coach: neither, and no bonus count', () => {
    const o = render(<GymDashboard view={owner()} />);
    expect(href(o.container.querySelector('[data-settings-link]'))).toBe(`/atletas/gym/${GYM_PARTNER_ID}/ajustes`);
    expect(o.container.querySelector('[data-money-note]')).toBeTruthy();
    o.unmount();
    const c = render(<GymDashboard view={coach()} />);
    expect(c.container.querySelector('[data-settings-link]')).toBeNull();
    expect(c.container.querySelector('[data-money-note]')).toBeNull();
    expect(c.container.querySelector('[data-funnel="bonus_owed"]')).toBeNull();
    expect(screen.queryByText('Bonos por pagar')).toBeNull();
  });
});

describe('GymDashboard: Atletas', () => {
  it('level, status and the four counts per athlete', () => {
    const { container } = render(<GymDashboard view={owner()} />);
    tab('Atletas');
    const caro = container.querySelector('[data-athlete-row="00000000-0000-4000-8000-000000002003"]') as HTMLElement;
    expect(within(caro).getByText('Caro')).toBeTruthy();
    expect(caro.textContent).toContain('Atleta Tribe');
    expect(caro.textContent).toContain('Activo');
    expect([...caro.querySelectorAll('[data-count]')].map((d) => d.getAttribute('data-value'))).toEqual([
      '7',
      '6',
      '3',
      '1',
    ]);
    expect(caro.querySelector('[data-bonus-owed]')?.getAttribute('data-bonus-owed')).toBe('2');
  });

  it('Promote only for the ready captain, and it sets level athlete', async () => {
    const { container } = render(<GymDashboard view={owner()} />);
    tab('Atletas');
    const promotes = container.querySelectorAll('[data-action="promote"]');
    expect(promotes).toHaveLength(1);
    const beto = container.querySelector('[data-athlete-row="00000000-0000-4000-8000-000000002002"]') as HTMLElement;
    expect(within(beto).getByText('Listo para subir')).toBeTruthy();
    fireEvent.click(within(beto).getByText('Subir de nivel'));
    await waitFor(() =>
      expect(h.level).toHaveBeenCalledWith(expect.anything(), '00000000-0000-4000-8000-000000002002', 'athlete')
    );
    expect(h.refresh).toHaveBeenCalled();
    const ana = container.querySelector('[data-athlete-row="00000000-0000-4000-8000-000000002001"]') as HTMLElement;
    expect(ana.querySelector('[data-action="promote"]')).toBeNull();
    expect(ana.querySelector('[data-ready-badge]')).toBeNull();
  });

  it('pause, and the cap refusal on resume is worded with the maximum', async () => {
    h.status.mockResolvedValue({ success: false, error: 'program_full' });
    const paused = gymSummary();
    paused.athletes[0] = { ...paused.athletes[0], status: 'paused' };
    const { container } = render(<GymDashboard view={toGymView(GYM_PARTNER_ID, paused, NOW)} />);
    tab('Atletas');
    const ana = container.querySelector('[data-athlete-row="00000000-0000-4000-8000-000000002001"]') as HTMLElement;
    fireEvent.click(within(ana).getByText('Reactivar'));
    await waitFor(() =>
      expect(within(ana).getByRole('alert').textContent).toBe(
        'Ya tienes 5 atletas activos. Pausa o termina uno para agregar otro.'
      )
    );
    expect(h.status).toHaveBeenCalledWith(expect.anything(), '00000000-0000-4000-8000-000000002001', 'active');
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it('coach: no action anywhere, and no add form', () => {
    const { container } = render(<GymDashboard view={coach()} />);
    tab('Atletas');
    expect(container.querySelectorAll('[data-athlete-row]')).toHaveLength(3);
    expect(container.querySelector('[data-action]')).toBeNull();
    expect(container.querySelector('[data-add-athlete]')).toBeNull();
    tab('Invitados');
    fireEvent.click(screen.getByText('Todos'));
    expect(container.querySelectorAll('[data-guest-row]')).toHaveLength(5);
    // No "Registrar resultado", no checkbox, no button on any row (GymGuests.test.tsx has the owner half).
    expect(container.querySelector('[data-guest-row] [data-action]')).toBeNull();
    expect(container.querySelector('[data-outcomes]')).toBeNull();
  });
});

describe('T-AV27b: "Marcar como patrocinado" is the admin screen only', () => {
  it('absent on the gym dashboard, owner included', () => {
    const { container } = render(<GymDashboard view={owner()} />);
    tab('Atletas');
    expect(container.querySelector('[data-action="sponsor"]')).toBeNull();
  });

  it('with canSponsor (the admin screen): on every non-sponsored row, setting level sponsored', async () => {
    const { container } = render(<GymAthletes view={owner()} canSponsor />);
    expect(container.querySelectorAll('[data-action="sponsor"]')).toHaveLength(3);
    fireEvent.click(
      container.querySelector(
        '[data-athlete-row="00000000-0000-4000-8000-000000002003"] [data-action="sponsor"]'
      ) as HTMLElement
    );
    await waitFor(() =>
      expect(h.level).toHaveBeenCalledWith(expect.anything(), '00000000-0000-4000-8000-000000002003', 'sponsored')
    );
    expect(screen.getAllByText('Marcar como patrocinado (solo admin)')).toHaveLength(3);
  });
});

describe('GymDashboard: Agregar atleta', () => {
  async function pick(container: HTMLElement) {
    tab('Atletas');
    h.search.mockResolvedValue({ success: true, data: [{ id: 'diego', name: 'Diego Prueba', avatarUrl: null }] });
    fireEvent.change(container.querySelector('[data-add-query]') as HTMLElement, { target: { value: 'die' } });
    fireEvent.submit(container.querySelector('[role="search"]') as HTMLElement);
    await waitFor(() => expect(container.querySelector('[data-candidate="diego"]')).toBeTruthy());
    fireEvent.click(container.querySelector('[data-candidate="diego"]') as HTMLElement);
  }

  it('nothing is searched below three characters', () => {
    const { container } = render(<GymDashboard view={owner()} />);
    tab('Atletas');
    fireEvent.change(container.querySelector('[data-add-query]') as HTMLElement, { target: { value: 'di' } });
    fireEvent.submit(container.querySelector('[role="search"]') as HTMLElement);
    expect(h.search).not.toHaveBeenCalled();
  });

  it('a result shows the name only, and a WhatsApp is normalized to E.164 before av_athletes_add', async () => {
    const { container } = render(<GymDashboard view={owner()} />);
    await pick(container);
    expect(h.search).toHaveBeenCalledWith(expect.anything(), GYM_PARTNER_ID, 'die');
    expect(container.querySelector('[data-add-results]')?.textContent).toBe('DDiego Prueba');
    fireEvent.change(container.querySelector('[data-add-whatsapp]') as HTMLElement, {
      target: { value: '300 555 1234' },
    });
    fireEvent.submit(container.querySelector('[data-add-form]') as HTMLElement);
    await waitFor(() =>
      expect(h.add).toHaveBeenCalledWith(expect.anything(), GYM_PARTNER_ID, 'diego', '+573005551234')
    );
  });

  it('an unusable WhatsApp is refused with no request', async () => {
    const { container } = render(<GymDashboard view={owner()} />);
    await pick(container);
    fireEvent.change(container.querySelector('[data-add-whatsapp]') as HTMLElement, { target: { value: '12345' } });
    fireEvent.submit(container.querySelector('[data-add-form]') as HTMLElement);
    expect(container.querySelector('[data-whatsapp-invalid]')?.textContent).toBe(
      'Escribe el WhatsApp con código de país, por ejemplo +57 300 123 4567.'
    );
    expect(h.add).not.toHaveBeenCalled();
  });

  it('an empty WhatsApp is sent as null; the cap and "already" refusals are worded', async () => {
    h.add.mockResolvedValueOnce({ success: false, error: 'program_full' });
    const { container } = render(<GymDashboard view={owner()} />);
    await pick(container);
    fireEvent.submit(container.querySelector('[data-add-form]') as HTMLElement);
    await waitFor(() => expect(container.querySelector('[data-add-error]')).toBeTruthy());
    expect(h.add).toHaveBeenCalledWith(expect.anything(), GYM_PARTNER_ID, 'diego', null);
    expect(container.querySelector('[data-add-error]')?.textContent).toBe(
      'Ya tienes 5 atletas activos. Pausa o termina uno para agregar otro.'
    );
    h.add.mockResolvedValueOnce({ success: false, error: 'already_added' });
    fireEvent.submit(container.querySelector('[data-add-form]') as HTMLElement);
    await waitFor(() =>
      expect(container.querySelector('[data-add-error]')?.textContent).toBe('Esta persona ya está en tu programa.')
    );
  });
});
