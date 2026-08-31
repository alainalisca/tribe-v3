import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mocks (declared before importing the route).
vi.mock('@/lib/logger', () => ({ log: vi.fn(), logError: vi.fn() }));
vi.mock('@/lib/auth/cron', () => ({ isValidCronAuth: () => true }));
vi.mock('@/lib/time/bogotaDate', () => ({
  bogotaToday: () => '2026-06-15',
  bogotaDateOffset: () => '2026-06-16',
}));
vi.mock('@/lib/sessionLocation', () => ({ formatSessionLocation: () => 'Parque' }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/dal', () => ({
  updateSession: vi.fn(async () => ({ success: true })),
  fetchActiveSessionsForDates: vi.fn(),
  fetchUserProfileMaybe: vi.fn(),
  fetchParticipantsWithUserDetails: vi.fn(),
}));
vi.mock('@/lib/dal/notificationPreferences', () => ({ shouldSendNotification: vi.fn() }));

import { GET } from './route';
import { fetchActiveSessionsForDates, fetchUserProfileMaybe, fetchParticipantsWithUserDetails } from '@/lib/dal';
import { shouldSendNotification } from '@/lib/dal/notificationPreferences';

process.env.NEXT_PUBLIC_SITE_URL = 'https://test.tribe.app';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.CRON_SECRET = 'test-cron-secret';

function makeRequest(): Request {
  return new Request('http://localhost/api/cron/session-reminders', {
    headers: { authorization: 'Bearer test-cron-secret' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // Local wall-clock 10:00; the session below starts 11:02, i.e. 62 minutes out,
  // inside the [now+60, now+65] one-hour reminder window.
  vi.setSystemTime(new Date('2026-06-15T10:00:00'));

  (fetchActiveSessionsForDates as ReturnType<typeof vi.fn>).mockResolvedValue({
    success: true,
    data: [
      {
        id: 'sess-1',
        creator_id: 'creator-1',
        sport: 'Yoga',
        date: '2026-06-15',
        start_time: '11:02:00',
        location: 'Parque',
        reminder_1hr_sent: false,
        reminder_15min_sent: false,
      },
    ],
  });
  (fetchUserProfileMaybe as ReturnType<typeof vi.fn>).mockResolvedValue({
    success: true,
    data: { id: 'creator-1', preferred_language: 'en' },
  });
  (fetchParticipantsWithUserDetails as ReturnType<typeof vi.fn>).mockResolvedValue({
    success: true,
    data: [{ user_id: 'part-1', user: { id: 'part-1', preferred_language: 'en' } }],
  });
  // Category gate: participant on, creator off. This is the ONLY thing that
  // decides delivery now; the legacy column is never consulted.
  (shouldSendNotification as ReturnType<typeof vi.fn>).mockImplementation((_c: unknown, userId: string) =>
    Promise.resolve(userId === 'part-1')
  );

  fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('session-reminders cron: session_reminders category is authoritative', () => {
  it('pushes only to users whose session_reminders category is on; a category-off user gets none', async () => {
    await GET(makeRequest());

    // Exactly one push: part-1 (category on). creator-1 (category off) suppressed.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.userId).toBe('part-1');

    // The gate was consulted per user with the session_reminder type on push.
    expect(shouldSendNotification).toHaveBeenCalledWith(expect.anything(), 'creator-1', 'session_reminder', 'push');
    expect(shouldSendNotification).toHaveBeenCalledWith(expect.anything(), 'part-1', 'session_reminder', 'push');
  });

  it('a category-on user does receive the reminder push', async () => {
    (shouldSendNotification as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    await GET(makeRequest());

    // Both the creator and the participant are pushed when the category is on.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const pushedIds = fetchMock.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body).userId).sort();
    expect(pushedIds).toEqual(['creator-1', 'part-1']);
  });

  it('does not read the legacy session_reminders_enabled column (irrelevant to the outcome)', async () => {
    await GET(makeRequest());

    // The creator and participants are fetched WITHOUT the legacy column in the
    // select list, proving the column plays no part in delivery.
    expect(fetchUserProfileMaybe).toHaveBeenCalledWith(expect.anything(), 'creator-1', 'id, preferred_language');
    expect(fetchParticipantsWithUserDetails).toHaveBeenCalledWith(
      expect.anything(),
      'sess-1',
      'id, preferred_language'
    );
  });
});
