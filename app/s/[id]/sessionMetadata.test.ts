import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
// React's cache() is a server-component API absent from the client build vitest
// loads; same passthrough as app/pase/[slug]/metadata.test.ts.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T>(fn: T) => fn,
}));

import { sessionMetadata, SESSION_UNAVAILABLE_METADATA } from './sessionMetadata';
import type { InitialSession } from './SessionShareClient';

/**
 * T-OG1. One session, two URLs, one card. /s/[id] and /session/[id] build
 * their tags here; only og:url differs, and it names the page itself on
 * tribelatam.com (T-DOMAIN1), never the Vercel host.
 */

const session = {
  id: 'abc',
  title: 'CrossFit',
  sport: 'crossfit',
  date: '2026-10-14',
  start_time: '19:30:00',
  location: 'CrossFit BullBox Ciudad del Río',
  location_lat: null,
  location_lng: null,
  price_cents: 5000000,
  currency: 'COP',
  max_participants: 12,
  current_participants: 4,
  photos: ['https://x.supabase.co/storage/v1/object/public/p/1.jpg'],
  creator_id: 'u1',
  creator: { id: 'u1', name: 'Leo Garcia', avatar_url: null, average_rating: 4.9 },
} as unknown as InitialSession;

describe('sessionMetadata', () => {
  it.each(['/s/abc/', '/session/abc/'])('og:url for %s is that page on the canonical host', (pagePath) => {
    const md = sessionMetadata(session, pagePath);
    expect((md.openGraph as { url: string }).url).toBe(`https://tribelatam.com${pagePath}`);
  });

  it('gives both routes the same title, description and image', () => {
    const a = sessionMetadata(session, '/s/abc/');
    const b = sessionMetadata(session, '/session/abc/');
    expect(b.title).toBe(a.title);
    expect(b.description).toBe(a.description);
    expect(b.openGraph?.images).toEqual(a.openGraph?.images);
    expect(b.twitter).toEqual(a.twitter);
  });

  it('carries title, Spanish date/time and venue, a 1200x630 image and a large Twitter card', () => {
    const md = sessionMetadata(session, '/session/abc/');
    expect(md.openGraph?.title).toBe('CrossFit con Leo Garcia');
    expect(md.description).toContain('CrossFit BullBox Ciudad del Río');
    expect(md.description).toContain('mié 14 oct');

    const [image] = md.openGraph?.images as { url: string; width: number; height: number }[];
    expect(image.width).toBe(1200);
    expect(image.height).toBe(630);
    const url = new URL(image.url);
    expect(url.origin).toBe('https://tribelatam.com');
    expect(url.pathname).toBe('/api/og/');
    expect(url.searchParams.get('date')).toBe('Miércoles 14 de octubre · 7:30 p.m.');
    expect(url.searchParams.get('image')).toBe('https://x.supabase.co/storage/v1/object/public/p/1.jpg');

    expect((md.twitter as { card: string }).card).toBe('summary_large_image');
  });

  it('returns the generic Spanish tags for a missing session rather than throwing', () => {
    expect(sessionMetadata(null, '/session/gone/')).toBe(SESSION_UNAVAILABLE_METADATA);
  });
});

describe('/session/[id] is a server page', () => {
  // A client component cannot export generateMetadata. If 'use client' comes
  // back to page.tsx, the build fails loudly; if generateMetadata is dropped,
  // nothing fails and the card silently disappears. This pins the second case.
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'session', '[id]', 'page.tsx'), 'utf-8');

  it('exports generateMetadata from the shared builder', () => {
    expect(src).not.toMatch(/^\s*['"]use client['"]/m);
    expect(src).toMatch(/export async function generateMetadata/);
    expect(src).toContain('sessionMetadata(await fetchPublicSession(id), `/session/${id}/`)');
  });
});
