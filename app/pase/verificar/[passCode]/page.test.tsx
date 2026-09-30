/**
 * T-AV21: /pase/verificar/[passCode]/ page and view.
 *
 * Mutation proofs (run by hand, recorded in the T-AV21 report):
 *   - swap the order so the session is read before the flag -> "flag off is a
 *     404 even when signed out" goes red (it asserts getUser was never called).
 *   - delete the `if (!user) redirect(...)` -> "signed out redirects" goes red.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  requireAthleteValuePage: vi.fn(),
  getUser: vi.fn(),
  fetchDoorPass: vi.fn(),
  confirmPassAttendance: vi.fn(),
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
vi.mock('@/lib/dal/passDoor', () => ({
  fetchDoorPass: h.fetchDoorPass,
  confirmPassAttendance: h.confirmPassAttendance,
}));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: h.language, t: (k: string) => k }) }));

import VerifyPassPage from './page';
import DoorPassView from './DoorPassView';

const params = (passCode = 'BU-4F7K') => ({ params: Promise.resolve({ passCode }) });
const PASS = {
  partnerName: 'BullBox (Prueba)',
  guestFirstName: 'Laura',
  claimedAt: '2026-09-29T14:00:00Z',
  attendedAt: null,
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
});

describe('DoorPassView', () => {
  it('confirming calls the DAL with method scan and shows the confirmation', async () => {
    h.confirmPassAttendance.mockResolvedValue({
      success: true,
      data: { attendedAt: '2026-09-29T15:00:00Z', alreadyConfirmed: false },
    });
    render(<DoorPassView passCode="BU-4F7K" pass={PASS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm attendance' }));
    await waitFor(() => expect(screen.getByText('Attendance confirmed')).toBeTruthy());
    expect(h.confirmPassAttendance).toHaveBeenCalledWith(expect.anything(), 'BU-4F7K', 'scan');
  });

  it('an already-confirmed pass shows the date and no button', () => {
    render(<DoorPassView passCode="BU-4F7K" pass={{ ...PASS, attendedAt: '2026-09-28T15:00:00Z' }} />);
    expect(screen.getByText(/Already confirmed on /)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a failed confirm says so and keeps the button', async () => {
    h.confirmPassAttendance.mockResolvedValue({ success: false, error: 'not_found' });
    render(<DoorPassView passCode="BU-4F7K" pass={PASS} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm attendance' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('We could not save that. Try again.'));
    expect(screen.getByRole('button', { name: 'Confirm attendance' })).toBeTruthy();
  });

  it('renders the approved ES copy', () => {
    h.language = 'es';
    render(<DoorPassView passCode="BU-4F7K" pass={PASS} />);
    expect(screen.getByRole('heading').textContent).toBe('Confirmar asistencia');
    expect(screen.getByText('Gimnasio')).toBeTruthy();
    expect(screen.getByText('Invitado')).toBeTruthy();
    expect(screen.getByText(/Reclamado el /)).toBeTruthy();
    h.language = 'es';
    render(<DoorPassView passCode="X" pass={null} />);
    expect(screen.getByText('Este pase no es de tu gimnasio.')).toBeTruthy();
  });
});
