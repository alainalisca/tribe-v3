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
 * The message (approved by Al, 2026-10-19), greeting the invite by first name:
 *   ES  "Hola Mateo, te tomamos fotos en Boxeo con Salomón. Míralas aquí: https://tribelatam.com/m/<token>/"
 *   EN  "Hi Mateo, we took photos of you at Boxing with Salomón. See them here: https://tribelatam.com/m/<token>/"
 * With no name the greeting goes ("Te tomamos fotos en ..."); with no coach,
 * " con <coach>" goes. `session` is the session's own title or its sport.
 */
export function whatsappText(
  lang: 'es' | 'en',
  args: { name: string | null; session: string; coach: string; link: string }
): string {
  const first = (args.name ?? '').trim().split(/\s+/)[0] ?? '';
  if (lang === 'en') {
    const body = `${first ? 'we' : 'We'} took photos of you at ${args.session}${args.coach ? ` with ${args.coach}` : ''}. See them here: ${args.link}`;
    return first ? `Hi ${first}, ${body}` : body;
  }
  const body = `${first ? 'te' : 'Te'} tomamos fotos en ${args.session}${args.coach ? ` con ${args.coach}` : ''}. Míralas aquí: ${args.link}`;
  return first ? `Hola ${first}, ${body}` : body;
}
