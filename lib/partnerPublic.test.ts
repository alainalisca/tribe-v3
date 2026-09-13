import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  partnerLookupColumn,
  partnerDescription,
  fetchPublicPartner,
  PUBLIC_PARTNER_COLUMNS,
  type PublicPartner,
} from './partnerPublic';

const BULLBOX: PublicPartner = {
  id: '040cbc21-1b11-4ae1-aa99-9fe35a32bda0',
  slug: 'bullbox',
  business_name: 'CrossFit BullBox',
  business_type: 'gym',
  description: null,
  description_es: 'Box de CrossFit en Ciudad del Río, El Poblado.',
  logo_url: null,
  logo_image_url: 'https://example.supabase.co/avatar.jpeg',
  banner_url: null,
  website_url: null,
  phone: null,
  address: 'Cra 43G #25a-50, El Poblado, Medellín',
  lat: null,
  lng: null,
  specialties: ['CrossFit'],
  display_order: 100,
};

describe('partnerLookupColumn', () => {
  it('treats a UUID segment as an id, so old UUID links never break', () => {
    expect(partnerLookupColumn('040cbc21-1b11-4ae1-aa99-9fe35a32bda0')).toBe('id');
    expect(partnerLookupColumn('040CBC21-1B11-4AE1-AA99-9FE35A32BDA0')).toBe('id');
  });

  it('treats anything else as a slug', () => {
    expect(partnerLookupColumn('bullbox')).toBe('slug');
    expect(partnerLookupColumn('entrenamiento-cross-training-funcional')).toBe('slug');
    expect(partnerLookupColumn('does-not-exist')).toBe('slug');
  });

  it('does not mistake a slug-shaped near-UUID for an id', () => {
    // Too short, and a real slug could plausibly look like this.
    expect(partnerLookupColumn('040cbc21-1b11-4ae1-aa99')).toBe('slug');
  });
});

describe('partnerDescription', () => {
  it('prefers the language match', () => {
    const both = { ...BULLBOX, description: 'English copy' };
    expect(partnerDescription(both, 'es')).toBe(BULLBOX.description_es);
    expect(partnerDescription(both, 'en')).toBe('English copy');
  });

  it('falls back to the other language rather than rendering nothing', () => {
    // Every live partner has description NULL and only description_es filled,
    // so a strict match would show an English visitor a page with no
    // description at all.
    expect(partnerDescription(BULLBOX, 'en')).toBe(BULLBOX.description_es);
    expect(partnerDescription({ ...BULLBOX, description_es: null, description: 'only en' }, 'es')).toBe('only en');
  });

  it('returns null when the partner has written nothing', () => {
    expect(partnerDescription({ ...BULLBOX, description: null, description_es: null }, 'es')).toBeNull();
  });
});

/** Minimal PostgREST-shaped chain that records what it was asked for. */
function fakeSupabase(result: { data: unknown; error: unknown }) {
  const calls: { table?: string; columns?: string; eqColumn?: string; eqValue?: string } = {};
  const chain = {
    select(columns: string) {
      calls.columns = columns;
      return chain;
    },
    eq(column: string, value: string) {
      calls.eqColumn = column;
      calls.eqValue = value;
      return chain;
    },
    maybeSingle: async () => result,
  };
  return {
    calls,
    client: {
      from(table: string) {
        calls.table = table;
        return chain;
      },
    } as never,
  };
}

describe('fetchPublicPartner', () => {
  it('reads partners_public, never featured_partners', async () => {
    // featured_partners' SELECT policy is (status='active' OR is_app_admin()),
    // so the base table works for an admin and returns nothing to a logged-out
    // visitor once a sponsorship lapses. No mocked-DAL test can see that in
    // production; this pins the table name instead.
    const { client, calls } = fakeSupabase({ data: BULLBOX, error: null });
    await fetchPublicPartner(client, 'bullbox');
    expect(calls.table).toBe('partners_public');
  });

  it('looks a slug up by slug and a UUID up by id', async () => {
    const bySlug = fakeSupabase({ data: BULLBOX, error: null });
    await fetchPublicPartner(bySlug.client, 'bullbox');
    expect(bySlug.calls.eqColumn).toBe('slug');
    expect(bySlug.calls.eqValue).toBe('bullbox');

    const byId = fakeSupabase({ data: BULLBOX, error: null });
    await fetchPublicPartner(byId.client, BULLBOX.id);
    expect(byId.calls.eqColumn).toBe('id');
  });

  it('names its columns explicitly and requests no commercial column', async () => {
    const { client, calls } = fakeSupabase({ data: BULLBOX, error: null });
    await fetchPublicPartner(client, 'bullbox');
    expect(calls.columns).toBe(PUBLIC_PARTNER_COLUMNS);
    expect(calls.columns).not.toContain('*');
    for (const secret of [
      'monthly_fee_cents',
      'min_rating',
      'min_sessions_per_month',
      'total_impressions',
      'total_clicks',
      'total_bookings',
      'user_id',
      'expires_at',
    ]) {
      expect(calls.columns).not.toContain(secret);
    }
  });

  it('returns null on a miss so the page can 404', async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    await expect(fetchPublicPartner(client, 'does-not-exist')).resolves.toBeNull();
  });

  it('returns null and logs on a query error rather than throwing a 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = fakeSupabase({ data: null, error: { message: 'permission denied' } });
    await expect(fetchPublicPartner(client, 'bullbox')).resolves.toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('the /g route never reads the base table', () => {
  // The static half of the same guard. A future edit that swaps the view for
  // featured_partners because "it has more columns" would pass every behavioural
  // test above, because they all mock the client.
  it.each(['app/g/[id]/page.tsx', 'app/g/[id]/GymShareClient.tsx'])('%s', (file) => {
    const src = readFileSync(join(process.cwd(), file), 'utf8');
    expect(src).not.toMatch(/from\(['"]featured_partners['"]\)/);
    expect(src).not.toMatch(/from\(['"]sessions['"]\)/);
  });
});
