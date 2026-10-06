/**
 * The consent sentence, server-side.
 *
 * Personal data leaves Tribe for a third party on this row, so what the person
 * agreed to is part of the record. It is a constant here and NEVER read from
 * the request body: a client that supplies its own consent_text chooses what
 * it appears to have agreed to, which makes the stored consent worthless as
 * evidence of anything.
 *
 * The política de tratamiento de datos this links to is being prepared; the page
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

/**
 * T-AV27a (Al, 2026-10-01). What a guest invited by a Tribe athlete also
 * agrees to. The athlete's home shows whether each guest JOINED, so the
 * consent has to say so. Spanish only, because the pass page is Spanish only
 * and the stored text is what the signer saw. First person, to match V1.
 *
 *   ES: "Mi primer nombre, si asistí a mi clase y si me inscribí se
 *        compartirán con {firstName}, quien me invitó. {gym} y Tribe
 *        registrarán si asistí."
 *   EN: "My first name, whether I attended my class and whether I joined will
 *        be shared with {firstName}, who invited me. {gym} and Tribe will
 *        record whether I attended."
 *
 * IT REPLACES T-AV23's two constants rather than sitting beside them, which
 * the rule above would otherwise require. That rule protects rows already
 * written, and there are none: T-AV23's pair, "Mi primer nombre y si asistí se
 * compartirán con {firstName}, quien me invitó." and "{gym} y Tribe
 * registrarán si asistí a mi clase.", only ever ran on the unmerged athlete
 * branch against the local stack, and no local lead carried it on 2026-10-01.
 * From the merge on, the rule applies to this constant too.
 */
export const CONSENT_ATTRIBUTED_ES =
  'Mi primer nombre, si asistí a mi clase y si me inscribí se compartirán con {firstName}, quien me invitó. {gym} y Tribe registrarán si asistí.';

/** pass_leads_consent_text CHECK: 20 to 500 characters. */
export const CONSENT_MAX_CHARS = 500;

/**
 * The sentence for an attributed lead: V1, then CONSENT_ATTRIBUTED_ES.
 * Null when the result would not fit the 500-character
 * CHECK (business_name has no length limit and appears twice): the caller
 * then saves the lead WITHOUT attribution and with plain V1, because an
 * insert refused by the CHECK would lose the lead.
 */
export function consentTextForAttributed(partnerName: string, firstName: string): string | null {
  const text = [
    consentTextFor(partnerName),
    CONSENT_ATTRIBUTED_ES.replace('{firstName}', firstName).replace('{gym}', partnerName),
  ].join(' ');
  return text.length <= CONSENT_MAX_CHARS ? text : null;
}
