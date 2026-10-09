import { describe, it, expect } from 'vitest';
import type { PassConfig } from '@/lib/dal/passLeads';
import { passShareCard, passShareDescription } from './shareCard';

// Typed, never cast: a cast fixture is how a test silently feeds undefined to
// the code under test (see CLAUDE.md, "A CAST IN A TEST FIXTURE").
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

function imageParams(card: ReturnType<typeof passShareCard>): URLSearchParams {
  const images = card.openGraph?.images;
  const first = Array.isArray(images) ? images[0] : images;
  const url = typeof first === 'object' && first !== null && 'url' in first ? String(first.url) : String(first);
  return new URL(url).searchParams;
}

describe('passShareCard', () => {
  /**
   * The defect this exists for: the BullBox pass previewed in WhatsApp as the
   * generic Tribe card. Asserted on what the scraper reads, not on Tribe being
   * absent from some string.
   */
  it('brands the link preview with the partner, not Tribe', () => {
    const card = passShareCard(bullbox);
    expect(card.openGraph?.title).toContain('CrossFit BullBox');
    expect(card.openGraph?.title).not.toContain('Never Train Alone');
    expect(card.openGraph?.siteName).toBe('CrossFit BullBox');
    expect(card.twitter?.title).toBe(card.openGraph?.title);
  });

  // T-GROW3b: the OFFER is the star, not the partner's name -- the logo beside
  // it already says who this is. This asserts the EMPHASIS, which is the thing
  // that changed: the headline is what gets the display size, and the partner
  // name must NOT be competing for it. The previous version of this test
  // asserted title === partnerName, which pinned the old emphasis as the
  // contract and would have had to be deleted either way.
  it('makes the OFFER the headline and carries the logo beside it', () => {
    const params = imageParams(passShareCard(bullbox));
    expect(params.get('type')).toBe('pass');
    expect(params.get('title')).toBe('Tu primera clase gratis');
    expect(params.get('title')).not.toBe(bullbox.partnerName);
    expect(params.get('avatar')).toBe(bullbox.logoUrl);
  });

  it('puts what the partner does, then where they are, under the offer', () => {
    const params = imageParams(passShareCard({ ...bullbox, sub: 'CrossFit y HYROX', address: 'Ciudad del Río' }));
    expect(params.get('subtitle')).toBe('CrossFit y HYROX');
    expect(params.get('sub2')).toBe('Ciudad del Río');
  });

  // The partner name is still reachable -- it just moved off the image, where
  // the logo carries it, and into the text metadata. Without this the test
  // above could be satisfied by dropping the name entirely.
  it('keeps the partner name in the text metadata even though it left the image', () => {
    const card = passShareCard(bullbox);
    expect(card.openGraph?.title).toContain('CrossFit BullBox');
    expect(card.openGraph?.siteName).toBe('CrossFit BullBox');
  });

  it('declares BOTH openGraph and twitter, because Next merges metadata shallowly', () => {
    const card = passShareCard(bullbox);
    expect(card.openGraph).toBeDefined();
    expect(card.twitter).toBeDefined();
  });

  it('falls back to an empty avatar (initials card) when the partner has no logo', () => {
    const params = imageParams(passShareCard({ ...bullbox, logoUrl: null }));
    expect(params.get('avatar')).toBe('');
  });
});

describe('passShareDescription', () => {
  it('uses pass_sub when set, else a sentence naming the partner', () => {
    expect(passShareDescription({ ...bullbox, sub: 'Ven a entrenar' })).toBe('Ven a entrenar');
    expect(passShareDescription(bullbox)).toContain('CrossFit BullBox');
  });

  it('is capped at 160 characters', () => {
    expect(passShareDescription({ ...bullbox, sub: 'a'.repeat(400) })).toHaveLength(160);
  });
});
