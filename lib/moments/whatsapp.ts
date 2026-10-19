/**
 * T-MOM1 Part C: "Enviar por WhatsApp". After "Entregar", each invite with a
 * phone gets a button that opens WhatsApp on the uploader's own phone with the
 * message written; the uploader sends it. Tribe sends no SMS or WhatsApp.
 *
 * Pure and client-safe. `phone` is E.164 as stored (+573001234567); wa.me
 * wants the digits only.
 */
export function whatsappHref(phone: string, text: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/**
 * The message (Al approves both texts in the PR):
 *   ES  "Te tomamos fotos en Boxeo con Salomón. Están aquí: https://tribelatam.com/m/<token>/"
 *   EN  "We took photos of you at Boxing with Salomón. They're here: https://tribelatam.com/m/<token>/"
 * `session` is the session's own title or its sport; `coach` the host's first name.
 */
export function whatsappText(
  lang: 'es' | 'en',
  session: string,
  coach: string,
  link: string
): string {
  if (lang === 'en') return `We took photos of you at ${session}${coach ? ` with ${coach}` : ''}. They're here: ${link}`;
  return `Te tomamos fotos en ${session}${coach ? ` con ${coach}` : ''}. Están aquí: ${link}`;
}
