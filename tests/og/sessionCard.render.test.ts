// @vitest-environment node
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

/**
 * T-JOIN1: a session card always comes back as an image a scraper can read.
 * The no-photo card renders as a baseline 1200 x 630 JPEG under 250 KB, and a
 * session that is not public gets the site's home card instead of a 404.
 */
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  getServiceRoleClient: () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) };
      return q;
    },
  }),
}));

import { cardResponse } from '@/lib/og/card';
import { sessionCardProps, sessionCardResponse, type SessionCardRow } from '@/lib/og/sessionCard';

const row: SessionCardRow = {
  id: 'f8230509-9aa3-4a79-98e4-afa7b6e695ef',
  title: null,
  sport: 'Yoga',
  date: '2030-10-21',
  start_time: '18:30:00',
  status: 'active',
  location: null,
  location_lat: null,
  location_lng: null,
  photos: ['https://x.supabase.co/storage/v1/object/public/session-photos/flyer.jpg'],
  creator_id: 'c1',
  creator_name: 'Neera yoga',
  partner_id: null,
  partner_status: null,
};

async function inspect(res: Response) {
  const buf = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(buf).metadata();
  return { type: res.headers.get('content-type'), bytes: buf.length, ...meta };
}

describe('session card render', () => {
  it('the no-photo card: a baseline 1200 x 630 JPEG under 250 KB', async () => {
    const m = await inspect(await cardResponse(sessionCardProps(row, null, null)));
    expect(m.type).toBe('image/jpeg');
    expect([m.width, m.height]).toEqual([1200, 630]);
    expect(m.isProgressive).toBe(false);
    expect(m.bytes).toBeLessThan(250 * 1024);
  }, 30_000);

  it('a session that is not public still gets an image: the site home card', async () => {
    const { res, fallback } = await sessionCardResponse('00000000-0000-4000-8000-000000000000');
    expect(fallback).toBe(true);
    const m = await inspect(res);
    expect(m.type).toBe('image/jpeg');
    expect([m.width, m.height]).toEqual([1200, 630]);
  }, 30_000);
});
