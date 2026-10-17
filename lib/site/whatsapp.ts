import { normalizeWhatsApp, waMeDigits } from '@/lib/pase/phone';

/**
 * T-SITE1 Part D. The one WhatsApp line for sales: NEXT_PUBLIC_WA_SALES (a
 * number, any common format). The prefilled message is Spanish and names the
 * page the visitor came from, so Al knows the context before replying.
 *
 * Null when the variable is unset or not a phone number: callers fall back to
 * the contact email rather than render a dead link.
 */
export type WaSalesPage = 'coaches' | 'gimnasios';

/** What the visitor is asking about, appended to the greeting. Spanish whatever the page language. */
export const WA_TOPICS = {
  partner: 'Quiero aplicar como aliado.',
  growth: 'Quiero saber de Tribe Crecimiento.',
  mediaDay: 'Quiero reservar un Media Day.',
} as const;

const PAGE_NAME: Record<WaSalesPage, string> = { coaches: 'coaches', gimnasios: 'gimnasios' };

export function waSalesLink(page: WaSalesPage, topic?: (typeof WA_TOPICS)[keyof typeof WA_TOPICS]): string | null {
  const e164 = normalizeWhatsApp(process.env.NEXT_PUBLIC_WA_SALES);
  if (!e164) return null;
  const text = `Hola Al, vengo de la página de ${PAGE_NAME[page]} de Tribe${topic ? `. ${topic}` : '.'}`;
  return `https://wa.me/${waMeDigits(e164)}?text=${encodeURIComponent(text)}`;
}
