import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { formatPlanPrice, mediaDayPaymentLink, sitePlanPrices, talkToAlHref } from './plans';
import { waSalesLink, WA_TOPICS } from './whatsapp';

/** T-SITE1 Part D: plan prices, the Media Day link and the WhatsApp sales line. */
afterEach(() => vi.unstubAllEnvs());

describe('plan prices', () => {
  it('reads the same variables as T-PLAN1 checkout, whole pesos', () => {
    vi.stubEnv('COACH_PLAN_PRO_AMOUNT', '99000');
    vi.stubEnv('COACH_PLAN_CRECIMIENTO_AMOUNT', '520000');
    vi.stubEnv('COACH_PLANS_CURRENCY', 'cop');
    const p = sitePlanPrices();
    expect(p.pro).toEqual({ amount: 99000, currency: 'COP' });
    expect(p.crecimiento).toEqual({ amount: 520000, currency: 'COP' });
  });

  it("falls back to the spec's prices when the variables are unset or junk", () => {
    vi.stubEnv('COACH_PLAN_PRO_AMOUNT', '');
    vi.stubEnv('COACH_PLAN_CRECIMIENTO_AMOUNT', '4.9e5x');
    const p = sitePlanPrices();
    expect(p.pro.amount).toBe(89000);
    expect(p.crecimiento.amount).toBe(490000);
    expect(p.mediaDay.amount).toBe(250000);
  });

  it('writes prices the way the spec does', () => {
    expect(formatPlanPrice({ amount: 89000, currency: 'COP' }, 'es')).toBe('89.000 COP');
    expect(formatPlanPrice({ amount: 490000, currency: 'COP' }, 'en')).toBe('490,000 COP');
  });
});

describe('Media Day link', () => {
  it('uses the Stripe Payment Link only when it is an https URL', () => {
    vi.stubEnv('MEDIA_DAY_PAYMENT_LINK', 'https://buy.stripe.com/abc');
    expect(mediaDayPaymentLink()).toBe('https://buy.stripe.com/abc');
    vi.stubEnv('MEDIA_DAY_PAYMENT_LINK', 'buy.stripe.com/abc');
    expect(mediaDayPaymentLink()).toBeNull();
  });
});

describe('WhatsApp sales line (NEXT_PUBLIC_WA_SALES)', () => {
  it('builds wa.me with a Spanish message naming the page', () => {
    vi.stubEnv('NEXT_PUBLIC_WA_SALES', '300 111 2233');
    const url = new URL(waSalesLink('gimnasios', WA_TOPICS.growth) ?? '');
    expect(url.origin + url.pathname).toBe('https://wa.me/573001112233');
    expect(url.searchParams.get('text')).toBe(
      'Hola Al, vengo de la página de gimnasios de Tribe. Quiero saber de Tribe Crecimiento.'
    );
    expect(new URL(waSalesLink('coaches') ?? '').searchParams.get('text')).toBe(
      'Hola Al, vengo de la página de coaches de Tribe.'
    );
  });

  it('never renders a dead link: no number means the contact email', () => {
    vi.stubEnv('NEXT_PUBLIC_WA_SALES', '');
    expect(waSalesLink('gimnasios')).toBeNull();
    expect(talkToAlHref('gimnasios')).toBe('mailto:info@tribelatam.com');
  });
});
