/**
 * T-AV21 and T-AV25: /pase/verificar/[passCode]/ page and view.
 *
 * Mutation proofs:
 *   - swap the order so the session is read before the flag -> "flag off is a
 *     404 even when signed out" goes red (it asserts getUser was never called).
 *   - delete the `if (!user) redirect(...)` -> "signed out redirects" goes red.
 *   - T-AV25: pass ?via= through instead of the fixed map -> "anything other
 *     than via=code is a scan" goes red (t-av25-mutations.LOCAL.sh, end to end).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { DoorPass } from '@/lib/dal/passDoor';

const h = vi.hoisted(() => ({
  requireAthleteValuePage: vi.fn(),
  getUser: vi.fn(),
  fetchDoorPass: vi.fn(),
  confirmPassAttendance: vi.fn(),
  setPassOutcome: vi.fn(),
  language: 'en' as 'en' | 'es',
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock('@/lib/features/athleteValueServer', () => ({ requireAthleteValuePage: h.requireAthleteValuePage }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: h.getUser } }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/dal/passDoor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dal/passDoor')>()),
  fetchDoorPass: h.fetchDoorPass,
  confirmPassAttendance: h.confirmPassAttendance,
  setPassOutcome: h.setPassOutcome,
}));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: h.language, t: (k: string) => k }) }));

import VerifyPassPage from './page';
import DoorPassView from './DoorPassView';

const params = (passCode = 'BU-4F7K', search: Record<string, string> = {}) => ({
  params: Promise.resolve({ passCode }),
  searchParams: Promise.resolve(search),
});
const PASS: DoorPass = {
  partnerName: 'BullBox (Prueba)',
  guestFirstName: 'Laura',
  claimedAt: '2026-09-29T14:00:00Z',
  attendedAt: null,
  athleteFirstName: null,
  outcome: null,
  welcomeOfferEn: 'First month at 20% off if you join this week.',
  welcomeOfferEs: 'Primer mes con 20% de descuento si te inscribes esta semana.',
};

beforeEach(() => {
  vi.clearAllMocks();
  h.language = 'en';
  h.requireAthleteValuePage.mockResolvedValue(undefined);
  h.getUser.mockResolvedValue({ data: { user: { id: 'coach-1' } } });
  h.fetchDoorPass.mockResolvedValue({ success: true, data: PASS });
});

describe('VerifyPassPage', () => {
  it('flag off is a 404 even when signed out, and the session is never read', async () => {
    h.requireAthleteValuePage.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND');
    });
    h.getUser.mockResolvedValue({ data: { user: null } });
    await expect(VerifyPassPage(params())).rejects.toThrow('NEXT_NOT_FOUND');
    expect(h.requireAthleteValuePage).toHaveBeenCalledWith('athletes');
    expect(h.getUser).not.toHaveBeenCalled();
    expect(h.fetchDoorPass).not.toHaveBeenCalled();
  });

  it('signed out redirects to /auth with the page as returnTo, and reads no pass', async () => {
    h.getUser.mockResolvedValue({ data: { user: null } });
    await expect(VerifyPassPage(params('BU-4F7K'))).rejects.toThrow(
      `NEXT_REDIRECT /auth?returnTo=${encodeURIComponent('/pase/verificar/BU-4F7K/')}`
    );
    expect(h.fetchDoorPass).not.toHaveBeenCalled();
  });

  it('T-AV25: a typed code keeps ?via=code through the sign-in', async () => {
    h.getUser.mockResolvedValue({ data: { user: null } });
    await expect(VerifyPassPage(params('BU-4F7K', { via: 'code' }))).rejects.toThrow(
      `NEXT_REDIRECT /auth?returnTo=${encodeURIComponent('/pase/verificar/BU-4F7K/?via=code')}`
    );
  });

  it('not your gym (or unknown code) renders the one refusal sentence', async () => {
    h.fetchDoorPass.mockResolvedValue({ success: true, data: null });
    render(await VerifyPassPage(params()));
    expect(screen.getByText('This pass is not for your gym.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a pass for your gym shows partner, first name, claim date and the confirm button', async () => {
    render(await VerifyPassPage(params()));
    expect(h.fetchDoorPass).toHaveBeenCalledWith(expect.anything(), 'BU-4F7K');
    expect(screen.getByText('BullBox (Prueba)')).toBeTruthy();
    expect(screen.getByText('Laura')).toBeTruthy();
    expect(screen.getByText(/Claimed on /)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm attendance' })).toBeTruthy();
  });

  it('T-AV25: via=code confirms with method code; anything else is a scan', async () => {
    h.confirmPassAttendance.mockResolvedValue({ success: true, data: { attendedAt: 'x', alreadyConfirmed: false } });
    for (const [search, method] of [
      [{ via: 'code' }, 'code'],
      [{}, 'scan'],
      [{ via: 'toggle' }, 'scan'],
      [{ via: 'anything' }, 'scan'],
    ] as const) {
      const { unmount } = render(await VerifyPassPage(params('BU-4F7K', search)));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm attendance' }));
      await waitFor(() =>
        expect(h.confirmPassAttendance).toHaveBeenLastCalledWith(expect.anything(), 'BU-4F7K', method)
      );
      unmount();
    }
  });
});

describe('DoorPassView', () => {
  it('confirming calls the DAL and then shows the offer and the four outcomes', async () => {
    h.confirmPassAttendance.mockResolvedValue({
      success: true,
      data: { attendedAt: '2026-09-29T15:00:00Z', alreadyConfirmed: false },
    });
    const { container } = render(<DoorPassView passCode="BU-4F7K" pass={PASS} />);
    expect(container.querySelector('[data-welcome-offer]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm attendance' }));
    await waitFor(() => expect(screen.getByText('Attendance confirmed')).toBeTruthy());
    expect(h.confirmPassAttendance).toHaveBeenCalledWith(expect.anything(), 'BU-4F7K', 'scan');
    expect(container.querySelector('[data-welcome-offer]')?.textContent).toBe(
      'Next: your close' + 'First month at 20% off if you join this week.'
    );
    expect([...container.querySelectorAll('[data-outcome]')].map((b) => b.getAttribute('data-outcome'))).toEqual([
      'joined',
      'follow_up',
      'not_now',
      'already_member',
    ]);
  });

  it('an already-confirmed pass shows the date, the outcomes, and no confirm button', () => {
    render(
      <DoorPassView passCode="BU-4F7K" pass={{ ...PASS, attendedAt: '2026-09-28T15:00:00Z', outcome: 'follow_up' }} />
    );
    expect(screen.getByText(/Already confirmed on /)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm attendance' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Follow up' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('an outcome is saved through av_athletes_set_outcome and says so', async () => {
    h.setPassOutcome.mockResolvedValue({ success: true, data: { outcome: 'joined' } });
    render(<DoorPassView passCode="BU-4F7K" pass={{ ...PASS, attendedAt: '2026-09-28T15:00:00Z' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Joined' }));
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    expect(h.setPassOutcome).toHaveBeenCalledWith(expect.anything(), 'BU-4F7K', 'joined');
    expect(screen.getByRole('button', { name: 'Joined' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('the database refusing joined before a show-up is worded, not swallowed', async () => {
    h.setPassOutcome.mockResolvedValue({ success: false, error: 'not_attended' });
    render(<DoorPassView passCode="BU-4F7K" pass={{ ...PASS, attendedAt: '2026-09-28T15:00:00Z' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Joined' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Confirm attendance first.'));
  });

  it('shows "Invitation from" the athlete when the pass is attributed', () => {
    h.language = 'es';
    render(<DoorPassView passCode="BU-4F7K" pass={{ ...PASS, athleteFirstName: 'Ana' }} />);
    expect(screen.getByText('Invitación de Ana')).toBeTruthy();
  });

  it('a failed confirm says so and keeps the button', async () => {
    h.confirmPassAttendance.mockResolvedValue({ success: false, error: 'not_found' });
    render(<DoorPassView passCode="BU-4F7K" pass={PASS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm attendance' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('We could not save that. Try again.'));
    expect(screen.getByRole('button', { name: 'Confirm attendance' })).toBeTruthy();
  });

  it('renders the approved ES copy, including the Spanish welcome offer after confirm', () => {
    h.language = 'es';
    render(<DoorPassView passCode="BU-4F7K" pass={{ ...PASS, attendedAt: '2026-09-28T15:00:00Z' }} />);
    expect(screen.getByRole('heading').textContent).toBe('Confirmar asistencia');
    expect(screen.getByText('Gimnasio')).toBeTruthy();
    expect(screen.getByText('Invitado')).toBeTruthy();
    expect(screen.getByText(/Reclamado el /)).toBeTruthy();
    expect(screen.getByText('Ahora: tu cierre')).toBeTruthy();
    expect(screen.getByText('Primer mes con 20% de descuento si te inscribes esta semana.')).toBeTruthy();
    expect(screen.getByText('¿Qué pasó después de la clase?')).toBeTruthy();
    h.language = 'es';
    render(<DoorPassView passCode="X" pass={null} />);
    expect(screen.getByText('Este pase no es de tu gimnasio.')).toBeTruthy();
  });

  it('no welcome offer written: the outcomes still show', () => {
    const { container } = render(
      <DoorPassView
        passCode="BU-4F7K"
        pass={{ ...PASS, attendedAt: 'x', welcomeOfferEn: null, welcomeOfferEs: null }}
      />
    );
    expect(container.querySelector('[data-welcome-offer]')).toBeNull();
    expect(container.querySelectorAll('[data-outcome]')).toHaveLength(4);
  });
});
