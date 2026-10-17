import 'server-only';
import { CONTACT_EMAIL } from './links';
import { waSalesLink, type WA_TOPICS, type WaSalesPage } from './whatsapp';

/**
 * T-SITE1 Part D. What the site says about Tribe's own plans, read on the
 * server. Everything here renders only while COACH_PLANS_ENABLED is on
 * (lib/site/flags); with it off the site shows no plan, price or plan link.
 *
 * PRICES COME FROM THE SAME VARIABLES T-PLAN1's checkout uses
 * (COACH_PLAN_PRO_AMOUNT, COACH_PLAN_CRECIMIENTO_AMOUNT, whole pesos, and
 * COACH_PLANS_CURRENCY), so the site cannot advertise one price and charge
 * another. The spec's prices are the fallback. Media Day has no plan
 * variable; its price is the spec's and its button is the Stripe Payment Link
 * in MEDIA_DAY_PAYMENT_LINK when set, else WhatsApp.
 *
 * Money story: these are Tribe's subscriptions for visibility and services,
 * never a fee on sessions. Tribe no cobra comisión.
 */
export type Price = { amount: number; currency: string };

function amount(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function sitePlanPrices(): { pro: Price; crecimiento: Price; mediaDay: Price } {
  const currency = (process.env.COACH_PLANS_CURRENCY || 'COP').toUpperCase();
  return {
    pro: { amount: amount('COACH_PLAN_PRO_AMOUNT', 89_000), currency },
    crecimiento: { amount: amount('COACH_PLAN_CRECIMIENTO_AMOUNT', 490_000), currency },
    mediaDay: { amount: 250_000, currency: 'COP' },
  };
}

/** "89.000 COP" / "89,000 COP": whole units, the code spelled out as the spec writes it. */
export function formatPlanPrice(price: Price, lang: 'es' | 'en'): string {
  const n = new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 0 }).format(price.amount);
  return `${n} ${price.currency}`;
}

/** The Stripe Payment Link for a Media Day, when one is configured. */
export function mediaDayPaymentLink(): string | null {
  const url = (process.env.MEDIA_DAY_PAYMENT_LINK ?? '').trim();
  return /^https:\/\//.test(url) ? url : null;
}

/** WhatsApp to Al from `page`, else the contact email: never a dead link. */
export function talkToAlHref(page: WaSalesPage, topic?: (typeof WA_TOPICS)[keyof typeof WA_TOPICS]): string {
  return waSalesLink(page, topic) ?? `mailto:${CONTACT_EMAIL}`;
}
