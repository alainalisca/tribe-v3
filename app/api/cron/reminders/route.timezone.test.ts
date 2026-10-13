import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ log: vi.fn(), logError: vi.fn() }));
vi.mock('@/lib/auth/cron', () => ({ isValidCronAuth: () => true }));
vi.mock('@/lib/time/bogotaDate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/time/bogotaDate')>();
  return { ...actual, bogotaToday: () => '2026-07-10' };
});
vi.mock('@/lib/sessionLocation', () => ({ formatSessionLocation: () => 'Parque' }));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: () => ({}) }));
vi.mock('@/lib/motivational-messages', () => ({
  getRandomMessage: () => ({ message: { morning_motivation: { en: { title: 'Go', body: 'Go!' }, es: { title: 'Ve', body: 'Ve!' } } }, index: 0 }),
  getMessageContent: () => ({ title: 'Go', body: 'Go!' }),
}));
vi.mock('@/lib/dal', () => ({
  updateSession: vi.fn(async () => ({ success: true })),
  updateUser: vi.fn(async () => ({ success: true })),
  fetchSessionsWithCreator: vi.fn(),
  fetchParticipantsWithUserDetails: vi.fn(async () => ({ success: true, data: [] })),
  fetchUsersWithPush: vi.fn(async () => ({ success: true, data: [] })),
}));

import { GET } from './route';
import { fetchSessionsWithCreator } from '@/lib/dal';

process.env.NEXT_PUBLIC_SITE_URL = 'https://test.tribe.app';
process.env.CRON_SECRET = 'test-cron-secret';

function makeRequest(): Request {
  return new Request('http://localhost/api/cron/reminders', {
    headers: { authorization: 'Bearer test-cron-secret' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cron/reminders timezone under TZ=UTC', () => {
  it('fires the 2-hour reminder at the right UTC moment for an 18:00 Bogotá session', async () => {
    // 18:00 Bogotá = 23:00 UTC. 2h before = 21:00 UTC. Set now to 21:00 UTC.
    vi.setSystemTime(new Date('2026-07-10T21:00:00Z'));

    (fetchSessionsWithCreator as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'sess-tz',
          creator_id: 'c1',
          sport: 'Yoga',
          date: '2026-07-10',
          start_time: '18:00:00',
          location: 'Parque',
          reminder_sent: false,
          creator: { id: 'c1', name: 'Al', preferred_language: 'en' },
        },
      ],
    });

    await GET(makeRequest());

    // The session at 23:00 UTC is exactly 2h from 21:00 UTC → reminder fires.
    expect(fetchMock).toHaveBeenCalled();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.userId).toBe('c1');
  });

  it('does NOT fire 5 hours early (at 16:00 UTC, the old-bug moment)', async () => {
    // Old bug: new Date('2026-07-10T18:00:00') under TZ=UTC → 18:00 UTC.
    // 2h before 18:00 UTC = 16:00 UTC. That's 11:00 Bogotá — way too early.
    vi.setSystemTime(new Date('2026-07-10T16:00:00Z'));

    (fetchSessionsWithCreator as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'sess-tz',
          creator_id: 'c1',
          sport: 'Yoga',
          date: '2026-07-10',
          start_time: '18:00:00',
          location: 'Parque',
          reminder_sent: false,
          creator: { id: 'c1', name: 'Al', preferred_language: 'en' },
        },
      ],
    });

    await GET(makeRequest());

    // At 16:00 UTC the session is 7h away (23:00 UTC) — no reminder.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
