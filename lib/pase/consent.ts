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
 * T-AV23 (D12). The two lines a guest invited by a Tribe athlete also agrees
 * to. Spanish only, because the pass page is Spanish only and the stored text
 * is what the signer saw. First person, to match V1's voice, and "primer
 * nombre" to match the approved EN ("Your first name and whether you attended
 * will be shared with {firstName}, who invited you." / "{gym} and Tribe will
 * record whether you attended your class."). Wording approved by Al,
 * 2026-09-30. New constants, not edits, per the rule above.
 */
export const CONSENT_ATHLETE_ES = 'Mi primer nombre y si asistí se compartirán con {firstName}, quien me invitó.';
export const CONSENT_ATTENDANCE_ES = '{gym} y Tribe registrarán si asistí a mi clase.';

/** pass_leads_consent_text CHECK: 20 to 500 characters. */
export const CONSENT_MAX_CHARS = 500;

/**
 * The sentence for an attributed lead: V1, then the athlete line, then the
 * attendance line. Null when the result would not fit the 500-character
 * CHECK (business_name has no length limit and appears twice): the caller
 * then saves the lead WITHOUT attribution and with plain V1, because an
 * insert refused by the CHECK would lose the lead.
 */
export function consentTextForAttributed(partnerName: string, firstName: string): string | null {
  const text = [
    consentTextFor(partnerName),
    CONSENT_ATHLETE_ES.replace('{firstName}', firstName),
    CONSENT_ATTENDANCE_ES.replace('{gym}', partnerName),
  ].join(' ');
  return text.length <= CONSENT_MAX_CHARS ? text : null;
}
