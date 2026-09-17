import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AttendanceTracker from './AttendanceTracker';

/**
 * T-ATH7: the host marks attendance, so the host is not a row on their own
 * checklist.
 *
 * fetchConfirmedParticipantsWithUsers reads session_participants_roster, which
 * returns the host's own participant row on the 23 live sessions that carry
 * one. Left unfiltered the host got a "present / absent" pair of buttons beside
 * their own name and counted toward the attendance totals that feed streaks and
 * badges.
 *
 * The component only loads a roster when it can manage attendance AND the
 * session has ended, so the fixture is a past session with isHost.
 */

const fetchConfirmedParticipantsWithUsers = vi.fn();
const fetchAttendanceForSession = vi.fn();

vi.mock('@/lib/dal', () => ({
  fetchConfirmedParticipantsWithUsers: (...args: unknown[]) => fetchConfirmedParticipantsWithUsers(...args),
  fetchAttendanceForSession: (...args: unknown[]) => fetchAttendanceForSession(...args),
  upsertAttendance: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' }),
}));
vi.mock('@/lib/toast', () => ({ showError: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/errorMessages', () => ({ getErrorMessage: () => 'error' }));

const HOST_ID = 'creator-1';

function renderTracker() {
  return render(
    <AttendanceTracker
      sessionId="session-1"
      creatorId={HOST_ID}
      isHost
      isAdmin={false}
      sessionDate="2020-01-01"
      sessionStartTime="10:00:00"
      sessionEndTime="11:00:00"
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchAttendanceForSession.mockResolvedValue({ success: true, data: [] });
});

describe('AttendanceTracker host filter', () => {
  it('omits the host row and keeps the athletes', async () => {
    fetchConfirmedParticipantsWithUsers.mockResolvedValue({
      success: true,
      data: [
        { user_id: HOST_ID, user: { id: HOST_ID, name: 'Al', avatar_url: null } },
        { user_id: 'athlete-1', user: { id: 'athlete-1', name: 'Ana', avatar_url: null } },
        { user_id: 'athlete-2', user: { id: 'athlete-2', name: 'Victor', avatar_url: null } },
      ],
    });

    renderTracker();

    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    expect(screen.getByText('Victor')).toBeInTheDocument();
    expect(screen.queryByText('Al')).toBeNull();
  });

  it('does not ask the attendance table about the host', async () => {
    fetchConfirmedParticipantsWithUsers.mockResolvedValue({
      success: true,
      data: [
        { user_id: HOST_ID, user: { id: HOST_ID, name: 'Al', avatar_url: null } },
        { user_id: 'athlete-1', user: { id: 'athlete-1', name: 'Ana', avatar_url: null } },
      ],
    });

    renderTracker();

    // The user-id list drives fetchAttendanceForSession, so a host left in the
    // roster would also pull a host attendance row into the totals -- not just
    // render an extra checkbox.
    await waitFor(() => expect(fetchAttendanceForSession).toHaveBeenCalled());
    const userIds = fetchAttendanceForSession.mock.calls[0][2];
    expect(userIds).toEqual(['athlete-1']);
  });

  it('renders nothing when the host is the only roster row', async () => {
    fetchConfirmedParticipantsWithUsers.mockResolvedValue({
      success: true,
      data: [{ user_id: HOST_ID, user: { id: HOST_ID, name: 'Al', avatar_url: null } }],
    });

    const { container } = renderTracker();

    // This is the exact shape of all 23 affected live sessions: one row, the
    // host's own. The checklist has nobody to mark, so it must not render.
    await waitFor(() => expect(container.querySelector('h2')).toBeNull());
    expect(screen.queryByText('Al')).toBeNull();
  });
});
