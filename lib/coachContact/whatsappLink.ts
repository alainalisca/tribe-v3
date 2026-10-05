/**
 * T-AV29 (P1-2). The WhatsApp link behind "Escríbele a {coach} por WhatsApp".
 *
 * The prefilled text tells the coach, inside their own WhatsApp, that this
 * person found them on Tribe (evaluation Revision 1: the coach sees the origin
 * where the conversation happens, which Tribe cannot see).
 */
import { waMeDigits } from '@/lib/pase/phone';

/** First word of a display name; the whole name if it has one word; '' for none. */
export function coachFirstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}

export function whatsappPrefill(coachName: string | null | undefined, language: 'en' | 'es'): string {
  const first = coachFirstName(coachName);
  if (language === 'es') return first ? `Hola ${first}, te encontré en Tribe.` : 'Hola, te encontré en Tribe.';
  return first ? `Hi ${first}, I found you on Tribe.` : 'Hi, I found you on Tribe.';
}

export function whatsappButtonLabel(coachName: string | null | undefined, language: 'en' | 'es'): string {
  const first = coachFirstName(coachName);
  if (language === 'es') return first ? `Escríbele a ${first} por WhatsApp` : 'Escríbele por WhatsApp';
  return first ? `Message ${first} on WhatsApp` : 'Message on WhatsApp';
}

/** https://wa.me/<digits>?text=<prefill>. wa.me wants digits only, no plus. */
export function whatsappHref(e164: string, coachName: string | null | undefined, language: 'en' | 'es'): string {
  return `https://wa.me/${waMeDigits(e164)}?text=${encodeURIComponent(whatsappPrefill(coachName, language))}`;
}
