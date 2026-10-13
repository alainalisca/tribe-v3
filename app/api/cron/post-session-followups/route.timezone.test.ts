import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ log: vi.fn(), logError: vi.fn() }));
vi.mock('@/lib/auth/cron', () => ({ isValidCronAuth: () => true }));
vi.mock('@/lib/time/bogotaDate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/time/bogotaDate')>();
  return { ...actual, bogotaToday: () => '2026-07-10' };
});
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: () => ({}) }));
vi.mock('@/lib/dal', () => ({
  updateSession: vi.fn(async () => ({ success: true })),
  fetchSessionsWithCreator: vi.fn(),
  fetchSessionAttendance: vi.fn(async () => ({
    success: true,
    data: [{ user_id: 'u1', attended: true }],
  })),
}));

import { GET } from './route';
import { fetchSessionsWithCreator } from '@/lib/dal';

process.env.NEXT_PUBLIC_SITE_URL = 'https://test.tribe.app';
process.env.CRON_SECRET = 'test-cron-secret';

function makeRequest(): Request {
  return new Request('http://localhost/api/cron/post-session-followups', {
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

describe('cron/post-session-followups timezone under TZ=UTC', () => {
  const session = {
    id: 'sess-tz',
    sport: 'Yoga',
    location: 'Parque',
    date: '2026-07-10',
    start_time: '18:00:00',
    duration: 60,
    followup_sent: false,
    creator: { id: 'c1', name: 'Al', preferred_language: 'en' },
  };

  it('no follow-up before the session has ended in Bogotá time', async () => {
    // 18:00 Bogotá + 60 min = 19:00 Bogotá = 00:00 UTC next day.
    // At 23:30 UTC the session hasn't ended yet (ends at 00:00 UTC).
    vi.setSystemTime(new Date('2026-07-10T23:30:00Z'));

    (fetchSessionsWithCreator as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [session],
    });

    const res = await GET(makeRequest());
    const json = await res.json();

    // Session end (00:00 UTC) > now (23:30 UTC) → not ended → no follow-up.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(json.count).toBe(0);
  });

  it('fires follow-up after the session has actually ended', async () => {
    // Session ends at 00:00 UTC on 2026-07-11. Set now to 00:30 UTC.
    vi.setSystemTime(new Date('2026-07-11T00:30:00Z'));

    (fetchSessionsWithCreator as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [session],
    });

    const res = await GET(makeRequest());
    const json = await res.json();

    // Session ended 30 min ago, within the 2h window → follow-up fires.
    expect(fetchMock).toHaveBeenCalled();
    expect(json.count).toBe(1);
  });
});
