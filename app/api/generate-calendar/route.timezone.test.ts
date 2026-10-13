import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/logger', () => ({ log: vi.fn(), logError: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: () => ({}) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock('@/lib/http/siteUrl', () => ({ SITE_URL: 'https://test.tribe.app' }));
vi.mock('@/lib/email/sender', () => ({ TRIBE_SENDER_ADDRESS: 'noreply@test.tribe.app' }));
vi.mock('@/lib/dal', () => ({
  fetchSessionFields: vi.fn(),
}));

import { GET } from './route';
import { fetchSessionFields } from '@/lib/dal';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generate-calendar ICS timezone under TZ=UTC', () => {
  it('outputs DTSTART at 23:00Z for an 18:00 Bogotá session with correct duration', async () => {
    (fetchSessionFields as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        id: 'sess-tz',
        sport: 'Yoga',
        location: 'Parque',
        date: '2026-07-10',
        start_time: '18:00:00',
        duration: 90,
        description: 'Morning flow',
        creator_name: 'Al',
      },
    });

    const req = new Request('http://localhost/api/generate-calendar?sessionId=sess-tz');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/calendar');

    const ics = await res.text();

    // 18:00 Bogotá = 23:00 UTC → DTSTART:20260710T230000Z
    expect(ics).toContain('DTSTART:20260710T230000Z');

    // 18:00 + 90min = 19:30 Bogotá = 00:30 UTC next day → DTEND:20260711T003000Z
    expect(ics).toContain('DTEND:20260711T003000Z');
  });

  it('does NOT output DTSTART at 18:00Z (the old-bug value)', async () => {
    (fetchSessionFields as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        id: 'sess-tz',
        sport: 'Yoga',
        location: 'Parque',
        date: '2026-07-10',
        start_time: '18:00:00',
        duration: 60,
        description: null,
        creator_name: null,
      },
    });

    const req = new Request('http://localhost/api/generate-calendar?sessionId=sess-tz');
    const res = await GET(req);
    const ics = await res.text();

    expect(ics).not.toContain('DTSTART:20260710T180000Z');
  });
});
