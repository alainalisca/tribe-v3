import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PassConfig } from '@/lib/dal/passLeads';

/**
 * The 2026-10-06 defect lived at the CALL SITE: lib/pase/shareCard did not
 * exist, and generateMetadata returned only a title, so WhatsApp inherited the
 * root layout's Tribe card for the BullBox pass. shareCard.test.ts cannot see
 * whether the page actually uses the card, so this drives generateMetadata
 * itself with the data path stubbed.
 */
const { fetchPassConfig } = vi.hoisted(() => ({
  fetchPassConfig: vi.fn<() => Promise<PassConfig | null>>(),
}));

// React's cache() is a server-component API absent from the client build vitest
// loads; a passthrough keeps one fetch per call, which is all this asserts on.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T>(fn: T) => fn,
}));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: () => ({}) }));
vi.mock('@/lib/dal/passLeads', () => ({
  fetchPassConfig: () => fetchPassConfig(),
  isOrganizationPartner: () => true,
}));

const bullbox: PassConfig = {
  partnerId: 'p1',
  slug: 'bullbox',
  partnerName: 'CrossFit BullBox',
  businessType: 'gym',
  address: null,
  logoUrl: 'https://x.supabase.co/storage/v1/object/public/partners/bullbox.jpg',
  storefrontUserId: null,
  headline: 'Tu primera clase gratis',
  sub: null,
  options: {},
  leadWhatsapp: null,
  leadEmail: 'leads@example.com',
  leadCc: [],
};

async function metadataFor(slug: string) {
  const { generateMetadata } = await import('./page');
  return generateMetadata({ params: Promise.resolve({ slug }) });
}

describe('/pase/[slug] generateMetadata', () => {
  beforeEach(() => fetchPassConfig.mockReset());

  it('an active pass declares its own partner-branded openGraph and twitter cards', async () => {
    fetchPassConfig.mockResolvedValue(bullbox);
    const meta = await metadataFor('bullbox');
    expect(fetchPassConfig).toHaveBeenCalled();
    expect(meta.openGraph?.title).toContain('CrossFit BullBox');
    expect(meta.openGraph?.images).toBeDefined();
    expect(meta.twitter).toBeDefined();
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('an inactive pass declares no partner card', async () => {
    fetchPassConfig.mockResolvedValue(null);
    const meta = await metadataFor('nope');
    expect(fetchPassConfig).toHaveBeenCalled();
    expect(meta.openGraph).toBeUndefined();
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});
