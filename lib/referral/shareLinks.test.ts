import { describe, it, expect } from 'vitest';
import { referralLink, referralMessage, whatsappShareUrl } from './shareLinks';
import { SITE_URL } from '@/lib/http/siteUrl';

describe('referralLink', () => {
  it('pass: /pase/{slug}/ with ref and src=referral, trailing slash, on SITE_URL', () => {
    expect(referralLink({ kind: 'pass', slug: 'bullbox', partnerName: 'X' }, 'KQ7M2Z')).toBe(
      `${SITE_URL}/pase/bullbox/?ref=KQ7M2Z&src=referral`
    );
  });
  it('session: the public /s/ route, not /session/', () => {
    expect(referralLink({ kind: 'session', sessionId: 'abc', title: 'T' }, 'TRIBE-AB2CD')).toBe(
      `${SITE_URL}/s/abc/?ref=TRIBE-AB2CD&src=referral`
    );
  });
  it('profile: the home page', () => {
    expect(referralLink({ kind: 'profile' }, 'TRIBE-AB2CD')).toBe(`${SITE_URL}/?ref=TRIBE-AB2CD&src=referral`);
  });
});

describe('referralMessage', () => {
  it('pass copy is the spec draft verbatim, both languages', () => {
    const ctx = { kind: 'pass' as const, slug: 'bullbox', partnerName: 'CrossFit BullBox' };
    expect(referralMessage(ctx, 'L', 'es')).toBe('Voy a una clase gratis en CrossFit BullBox con Tribe. Vente conmigo: L');
    expect(referralMessage(ctx, 'L', 'en')).toBe("I'm doing a free class at CrossFit BullBox with Tribe. Come with me: L");
  });
  it('never promises a reward in any context or language (Al is confirming it with Leo)', () => {
    const ctxs = [
      { kind: 'pass' as const, slug: 's', partnerName: 'P' },
      { kind: 'session' as const, sessionId: 'i', title: 'T' },
      { kind: 'profile' as const },
    ];
    for (const ctx of ctxs)
      for (const lang of ['es', 'en'] as const)
        expect(referralMessage(ctx, 'L', lang)).not.toMatch(/recompensa|reward|gan(a|amos)|earn|cr[eé]dito|credit/i);
  });
});

describe('whatsappShareUrl', () => {
  it('wa.me with no number and the whole message encoded, link included', () => {
    const url = whatsappShareUrl('Vente conmigo: https://tribelatam.com/?ref=A&src=referral');
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(url.slice('https://wa.me/?text='.length))).toBe(
      'Vente conmigo: https://tribelatam.com/?ref=A&src=referral'
    );
  });
});
