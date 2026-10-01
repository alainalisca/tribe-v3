/**
 * T-AV25: the door list's rows and the code field. The code field's key
 * property is that an unknown code and another gym's code show the SAME
 * message (the RPC answers both with one not_found).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { DoorListEntry } from '@/lib/dal/passDoor';

const h = vi.hoisted(() => ({ confirm: vi.fn(), setOutcome: vi.fn(), fetchPass: vi.fn(), push: vi.fn() }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es' }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock('@/lib/dal/passDoor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/dal/passDoor')>()),
  confirmPassAttendance: h.confirm,
  setPassOutcome: h.setOutcome,
  fetchDoorPass: h.fetchPass,
}));

import DoorList from './DoorList';

const ROW: DoorListEntry = {
  guestFirstName: 'Laura',
  passCode: 'BU-4F7K',
  claimedAt: '2026-09-29T14:00:00Z',
  attendedAt: null,
  outcome: null,
  athleteFirstName: 'Ana',
};

beforeEach(() => vi.clearAllMocks());

function typeCode(code: string) {
  fireEvent.change(screen.getByLabelText('Código del pase', { selector: 'input' }), { target: { value: code } });
  fireEvent.submit(document.querySelector('[data-code-entry]') as HTMLFormElement);
}

describe('DoorList rows', () => {
  it('a pass not yet confirmed shows "Llegó"; tapping it confirms with method toggle, then the outcomes appear', async () => {
    h.confirm.mockResolvedValue({
      success: true,
      data: { attendedAt: '2026-09-30T15:00:00Z', alreadyConfirmed: false },
    });
    const { container } = render(<DoorList entries={[ROW]} />);
    expect(screen.getByText('Invitación de Ana')).toBeTruthy();
    expect(container.querySelector('[data-outcome]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Llegó' }));
    await waitFor(() => expect(container.querySelectorAll('[data-outcome]')).toHaveLength(4));
    expect(h.confirm).toHaveBeenCalledWith(expect.anything(), 'BU-4F7K', 'toggle');
    expect(screen.queryByRole('button', { name: 'Llegó' })).toBeNull();
  });

  it('a confirmed pass shows its outcome selected and no "Llegó"', () => {
    render(<DoorList entries={[{ ...ROW, attendedAt: 'x', outcome: 'not_now' }]} />);
    expect(screen.queryByRole('button', { name: 'Llegó' })).toBeNull();
    expect(screen.getByRole('button', { name: 'No por ahora' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('empty: the empty sentence, and the code field is still there', () => {
    render(<DoorList entries={[]} />);
    expect(screen.getByText('Nadie pendiente por ahora.')).toBeTruthy();
    expect(document.querySelector('[data-code-entry]')).toBeTruthy();
  });

  it('a failed "Llegó" says so and keeps the button', async () => {
    h.confirm.mockResolvedValue({ success: false, error: 'not_found' });
    render(<DoorList entries={[ROW]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Llegó' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('No pudimos guardar eso. Intenta de nuevo.')
    );
    expect(screen.getByRole('button', { name: 'Llegó' })).toBeTruthy();
  });
});

describe('the code field', () => {
  it('a code that resolves opens the verify page with via=code, normalized', async () => {
    h.fetchPass.mockResolvedValue({ success: true, data: { partnerName: 'P' } });
    render(<DoorList entries={[]} />);
    typeCode('  bu-4f7k ');
    await waitFor(() => expect(h.push).toHaveBeenCalledWith('/pase/verificar/BU-4F7K/?via=code'));
    expect(h.fetchPass).toHaveBeenCalledWith(expect.anything(), 'BU-4F7K');
  });

  it("unknown and another gym's code: the RPC gives one answer, so the message is identical", async () => {
    h.fetchPass.mockResolvedValue({ success: true, data: null });
    const { unmount } = render(<DoorList entries={[]} />);
    typeCode('ZZ-2345');
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    const unknown = screen.getByRole('alert').textContent;
    unmount();
    render(<DoorList entries={[]} />);
    typeCode('OT-ROXX');
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toBe(unknown);
    expect(unknown).toBe('No encontramos ese pase. Revisa el código.');
    expect(h.push).not.toHaveBeenCalled();
  });

  it('not the pass shape: the same message, and no request at all', async () => {
    render(<DoorList entries={[]} />);
    typeCode('hola');
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('No encontramos ese pase. Revisa el código.')
    );
    expect(h.fetchPass).not.toHaveBeenCalled();
  });

  it('a transport error is the error sentence, not "not found"', async () => {
    h.fetchPass.mockResolvedValue({ success: false, error: 'down' });
    render(<DoorList entries={[]} />);
    typeCode('BU-4F7K');
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('No pudimos guardar eso. Intenta de nuevo.')
    );
  });
});

describe('outcome refusals', () => {
  it('locked (a retained or settled join) is the general error, not silence', async () => {
    h.setOutcome.mockResolvedValue({ success: false, error: 'locked' });
    render(<DoorList entries={[{ ...ROW, attendedAt: 'x', outcome: 'joined' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'No por ahora' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('No pudimos guardar eso. Intenta de nuevo.')
    );
    expect(screen.getByRole('button', { name: 'Se inscribió' }).getAttribute('aria-pressed')).toBe('true');
  });
});
