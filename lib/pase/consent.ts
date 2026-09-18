/**
 * The consent sentence, server-side.
 *
 * Personal data leaves Tribe for a third party on this row, so what the person
 * agreed to is part of the record. It is a constant here and NEVER read from
 * the request body: a client that supplies its own consent_text chooses what
 * it appears to have agreed to, which makes the stored consent worthless as
 * evidence of anything.
 *
 * Al is writing the política de tratamiento de datos this links to; the page
 * at /legal/tratamiento-de-datos is a stub until then. When the wording
 * changes, add a new constant rather than editing this one -- rows already
 * written must keep the sentence their signer actually saw.
 */
export const CONSENT_TEXT_V1 =
  'Autorizo a Tribe a compartir mi nombre, WhatsApp y correo con BullBox para que me contacte sobre mi clase gratis.';

/** Where the checkbox points. Never /legal/privacy, which describes a different thing. */
export const CONSENT_POLICY_PATH = '/legal/tratamiento-de-datos/';

/**
 * The sentence for a given partner.
 *
 * The v1 wording names BullBox literally because that is what the first pass
 * says and what its signers will have seen. For any other partner the name is
 * substituted, so an instructor's pass does not ask people to consent to
 * sharing with a gym they have never heard of.
 */
export function consentTextFor(partnerName: string): string {
  if (!partnerName || partnerName === 'BullBox') return CONSENT_TEXT_V1;
  return CONSENT_TEXT_V1.replace('BullBox', partnerName);
}
