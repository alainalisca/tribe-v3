/**
 * T-AV2 host attendance card. Flag on: Attended / No-show / not marked, a
 * one-tap "Everyone attended", and the 30-minute-before to 72-hour-after
 * window. Flag off: the card main shows, now writing through the same single
 * write path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AttendanceTracker from './AttendanceTracker';

const fetchConfirmedParticipantsWithUsers = vi.fn();
const fetchAttendanceMarks = vi.fn();
const markAttendance = vi.fn();
let flagOn = true;

vi.mock('@/lib/dal', () => ({
  fetchConfirmedParticipantsWithUsers: (...a: unknown[]) => fetchConfirmedParticipantsWithUsers(...a),
  fetchAttendanceMarks: (...a: unknown[]) => fetchAttendanceMarks(...a),
  markAttendance: (...a: unknown[]) => markAttendance(...a),
}));
vi.mock('@/lib/features/useAthleteValueFeature', () => ({ useAthleteValueFeature: () => flagOn }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'es' }) }));
const showError = vi.fn();
vi.mock('@/lib/toast', () => ({ showError: (...a: unknown[]) => showError(...a) }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/errorMessages', () => ({ getErrorMessage: () => 'generic error' }));

const fetchSpy = vi.fn(async () => ({ ok: true }));
const HOST = 'host-1';

/** A session running right now in Medellin: started 30 minutes ago. */
interface SessionTimesProps {
  sessionDate: string;
  sessionStartTime: string;
  sessionEndTime: string | null;
  sessionDurationMinutes: number | null;
}

function nowSession(): SessionTimesProps {
  const bogota = new Date(Date.now() - 5 * 3600 * 1000 - 30 * 60 * 1000);
  const iso = bogota.toISOString();
  return {
    sessionDate: iso.slice(0, 10),
    sessionStartTime: iso.slice(11, 19),
    sessionEndTime: null,
    sessionDurationMinutes: 120,
  };
}

function renderTracker(times: Partial<SessionTimesProps> = {}, isAdmin = false) {
  return render(
    <AttendanceTracker
      sessionId="s1"
      creatorId={HOST}
      isHost={!isAdmin}
      isAdmin={isAdmin}
      {...nowSession()}
      {...times}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  flagOn = true;
  vi.stubGlobal('fetch', fetchSpy);
  fetchConfirmedParticipantsWithUsers.mockResolvedValue({
    success: true,
    data: [
      { user_id: 'a1', user: { id: 'a1', name: 'Ana', avatar_url: null } },
      { user_id: 'a2', user: { id: 'a2', name: 'Victor', avatar_url: null } },
      { user_id: 'a3', user: { id: 'a3', name: 'Leo', avatar_url: null } },
    ],
  });
  fetchAttendanceMarks.mockResolvedValue({
    success: true,
    data: [{ user_id: 'a2', status: 'no_show', attended: false }],
  });
  markAttendance.mockResolvedValue({ success: true });
});

describe('flag on: three states', () => {
  it('shows Asistió and No vino per athlete, with the current mark pressed', async () => {
    renderTracker();
    await waitFor(() => expect(screen.getByText('Victor')).toBeInTheDocument());
    const victor = screen.getByRole('group', { name: 'Victor' });
    expect(victor.querySelector('[aria-pressed="true"]')?.textContent).toBe('No vino');
    const ana = screen.getByRole('group', { name: 'Ana' });
    expect(ana.querySelector('[aria-pressed="true"]')).toBeNull();
  });

  it('marks attended, and tapping the pressed choice un-marks (null)', async () => {
    renderTracker();
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('group', { name: 'Ana' }).querySelectorAll('button')[0]);
    await waitFor(() => expect(markAttendance).toHaveBeenCalledWith({}, 's1', 'a1', 'attended'));
    fireEvent.click(screen.getByRole('group', { name: 'Victor' }).querySelectorAll('button')[1]);
    await waitFor(() => expect(markAttendance).toHaveBeenCalledWith({}, 's1', 'a2', null));
  });

  it('"Todos asistieron" marks only the unmarked, and keeps an explicit No vino', async () => {
    renderTracker();
    await waitFor(() => expect(screen.getByText('Todos asistieron')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Todos asistieron'));
    await waitFor(() => expect(markAttendance).toHaveBeenCalledTimes(2));
    expect(markAttendance.mock.calls.map((c) => [c[2], c[3]])).toEqual([
      ['a1', 'attended'],
      ['a3', 'attended'],
    ]);
  });

  it('sends the existing attendance email only for an attended mark', async () => {
    renderTracker();
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('group', { name: 'Ana' }).querySelectorAll('button')[1]);
    await waitFor(() => expect(markAttendance).toHaveBeenCalledWith({}, 's1', 'a1', 'no_show'));
    expect(fetchSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('group', { name: 'Leo' }).querySelectorAll('button')[0]);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
  });

  it('a server refusal is shown in words, not as a generic error', async () => {
    markAttendance.mockResolvedValue({ success: false, error: 'outside_window', code: 'outside_window' });
    renderTracker();
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('group', { name: 'Ana' }).querySelectorAll('button')[0]);
    await waitFor(() => expect(showError).toHaveBeenCalledWith(expect.stringContaining('30 minutos antes')));
  });

  it('is hidden more than 30 minutes before the start', async () => {
    renderTracker({ sessionDate: '2099-01-01', sessionStartTime: '07:00:00' });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('markAttendance')).toBeNull();
    expect(fetchConfirmedParticipantsWithUsers).not.toHaveBeenCalled();
  });

  it('is hidden for a host 72 hours after the end, and still shown to an admin', async () => {
    const old = { sessionDate: '2020-01-01', sessionStartTime: '07:00:00', sessionEndTime: '08:00:00' };
    const { unmount } = renderTracker(old);
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchConfirmedParticipantsWithUsers).not.toHaveBeenCalled();
    unmount();
    renderTracker(old, true);
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
  });
});

describe('flag off: the card main shows', () => {
  it('has no three-state buttons and no "Todos asistieron"', async () => {
    flagOn = false;
    renderTracker({ sessionDate: '2020-01-01', sessionStartTime: '07:00:00', sessionEndTime: '08:00:00' });
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    expect(screen.queryByText('Todos asistieron')).toBeNull();
    expect(screen.queryByText('Asistió')).toBeNull();
    expect(screen.getByLabelText('Mark Ana as attended')).toBeInTheDocument();
  });

  it('the check writes attended and the cross writes no_show, through the one write path', async () => {
    flagOn = false;
    fetchAttendanceMarks.mockResolvedValue({
      success: true,
      data: [{ user_id: 'a2', status: 'attended', attended: true }],
    });
    renderTracker({ sessionDate: '2020-01-01', sessionStartTime: '07:00:00', sessionEndTime: '08:00:00' });
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Mark Ana as attended'));
    await waitFor(() => expect(markAttendance).toHaveBeenCalledWith({}, 's1', 'a1', 'attended'));
    fireEvent.click(screen.getByLabelText('Mark Victor as not attended'));
    await waitFor(() => expect(markAttendance).toHaveBeenCalledWith({}, 's1', 'a2', 'no_show'));
  });
});

describe('"Quién llegó" door guests (T-AV2b)', () => {
  it('a guest with no account is not on the card, and "Todos asistieron" marks every account after them', async () => {
    fetchConfirmedParticipantsWithUsers.mockResolvedValue({
      success: true,
      data: [
        { user_id: 'a1', user: { id: 'a1', name: 'Ana', avatar_url: null } },
        { user_id: null, is_guest: true, guest_name: 'Carolina', user: null },
        { user_id: 'a3', user: { id: 'a3', name: 'Leo', avatar_url: null } },
      ],
    });
    fetchAttendanceMarks.mockResolvedValue({ success: true, data: [] });
    renderTracker();
    await waitFor(() => expect(screen.getByText('Leo')).toBeInTheDocument());
    expect(screen.getAllByRole('group')).toHaveLength(2);
    expect(fetchAttendanceMarks).toHaveBeenCalledWith({}, 's1', ['a1', 'a3']);
    fireEvent.click(screen.getByText('Todos asistieron'));
    await waitFor(() => expect(markAttendance).toHaveBeenCalledTimes(2));
    expect(markAttendance.mock.calls.map((c) => c[2])).toEqual(['a1', 'a3']);
  });
});
