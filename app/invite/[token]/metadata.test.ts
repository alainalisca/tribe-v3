/**
 * generateMetadata for /invite/[token]:
 * 1. A valid token yields a session-specific card that leads with the inviter.
 * 2. An expired token falls back to the generic card — identical to not-found,
 *    so a link preview can't be used to probe token state.
 * 3. The invite token never appears in the emitted image URL (or anywhere in
 *    the metadata): OG image URLs end up in scraper caches and edge logs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const TOKEN = 'abc123def456abc123def456abc12345';

const mockRpc = vi.fn();
const mockMaybeSingle = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => mockMaybeSingle(table) }),
      }),
    }),
  }),
}));

import { generateMetadata } from './page';

const VALID_INVITE = {
  valid: true,
  session_id: 's1',
  created_by: 'inviter-1',
  expires_at: null,
  session: {
    id: 's1',
    creator_id: 'host-1',
    sport: 'Running',
    title: null,
    date: '2026-08-20',
    start_time: '07:00',
    duration: 60,
    description: null,
    location: 'Calle 10 #43E-31, El Poblado',
    location_lat: 6.209,
    location_lng: -75.567,
    is_paid: false,
    price_cents: null,
    currency: null,
    current_participants: 1,
    max_participants: 10,
    join_policy: 'invite_only',
  },
};

function mockEnrichment() {
  mockMaybeSingle.mockImplementation((table: string) => {
    if (table === 'sessions_public') {
      return Promise.resolve({
        data: { id: 's1', photos: ['https://cdn.example/photo.jpg'], creator_name: 'Coach', creator_avatar_url: null },
      });
    }
    return Promise.resolve({ data: { id: 'inviter-1', name: 'Ana', avatar_url: null } });
  });
}

async function metadataFor(token: string) {
  return generateMetadata({ params: Promise.resolve({ token }) });
}

describe('/invite/[token] generateMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnrichment();
  });

  it('valid token: session card led by the inviter, image via /api/og/ with trailing slash', async () => {
    mockRpc.mockResolvedValue({ data: VALID_INVITE, error: null });
    const md = await metadataFor(TOKEN);

    expect(md.title).toBe('Running | Tribe'); // title null → sport fallback
    expect(md.description?.startsWith('Ana invited you')).toBe(true);
    expect(md.description).toContain('Running');

    const ogImage = (md.openGraph?.images as Array<{ url: string }>)[0].url;
    expect(ogImage).toContain('/api/og/?'); // trailing slash: no 308 chase
    expect(ogImage).toContain('type=session');
    expect(ogImage).toContain('instructor=Ana');
    // The precise street address must not leak into the card.
    expect(JSON.stringify(md)).not.toContain('Calle 10');
  });

  it('expired token: generic card, indistinguishable from not-found, no state leak', async () => {
    mockRpc.mockResolvedValue({ data: { valid: false, reason: 'expired', session_id: 's1' }, error: null });
    const expired = await metadataFor(TOKEN);

    mockRpc.mockResolvedValue({ data: { valid: false, reason: 'not_found' }, error: null });
    const notFound = await metadataFor(TOKEN);

    expect(expired.title).toBe('Tribe — Never Train Alone');
    expect(expired).toEqual(notFound); // no oracle for token state
    const serialized = JSON.stringify(expired).toLowerCase();
    expect(serialized).not.toContain('expired');
    expect(serialized).not.toContain('invite');
    expect(serialized).not.toContain(TOKEN);
  });

  it('the token never appears in the image URL or anywhere in the metadata', async () => {
    mockRpc.mockResolvedValue({ data: VALID_INVITE, error: null });
    const md = await metadataFor(TOKEN);

    const ogImage = (md.openGraph?.images as Array<{ url: string }>)[0].url;
    const twitterImage = (md.twitter?.images as string[])[0];
    expect(ogImage).not.toContain(TOKEN);
    expect(twitterImage).not.toContain(TOKEN);
    // Belt and braces: no field of the metadata object carries the token
    // (openGraph.url is deliberately omitted for exactly this reason).
    expect(JSON.stringify(md)).not.toContain(TOKEN);
  });
});
