/**
 * WhatsApp number normalisation for the digital pass.
 *
 * Everything that reaches pass_leads.whatsapp is E.164, because the row's
 * whole purpose is a wa.me link the partner taps, and wa.me takes digits with
 * a country code and nothing else. The same person writing "300 111 2233",
 * "+57 300 111 2233" and "300-111-2233" must produce one value, or Leo sees
 * three leads and cannot tell they are one person.
 *
 * A bare 10 digit number is read as Colombian (the mobile plan is
 * 3XXXXXXXXX), which covers the Medellín audience these passes are printed
 * for. Every other form that carries its own country code is honoured as
 * written. See normalizeWhatsApp for the full rule list and why it grew.
 */

/** Colombia. Inferred for a bare 10 digit number, never imposed on one that carries its own code. */
const COLOMBIA = '57';

/**
 * E.164: a leading +, a non-zero first digit, 8 to 15 digits total. Matches
 * pass_leads_whatsapp_e164 in migration 173 -- if these two ever disagree the
 * database wins and the insert fails, so they are deliberately identical.
 */
const E164 = /^\+[1-9][0-9]{7,14}$/;

/**
 * Normalise a typed WhatsApp number to E.164, or null if it cannot be.
 *
 * COLOMBIA IS A DEFAULT, NOT A CEILING. An explicit country code is always
 * honoured, so a visitor from anywhere can claim a pass. This was not
 * academic: the first live test typed a US mobile as 13472132947 and the form
 * rejected it, because the only bare form accepted was a 10 digit Colombian
 * one.
 *
 * The rules, in the order they are tried:
 *
 *   +<8 to 15 digits>     accepted as written
 *   00<digits>            00 is the international prefix across Latin America
 *                         and reads as + to the person typing it
 *   10 bare digits        Colombia. The common case on the printed QR
 *   11 bare digits, 1...  US or Canada, typed without the plus
 *   12 bare digits, 57... Colombia, country code typed without the plus
 *   anything else         rejected
 *
 * Returning null rather than throwing: the caller turns this into one field
 * error on a form, and a thrown exception there would be indistinguishable
 * from a bug.
 */
export function normalizeWhatsApp(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;

  // Everything a person might type as punctuation or grouping, including the
  // (0) some people copy out of an international format. Unicode spaces are in
  // here because a number pasted from WhatsApp itself often carries U+00A0.
  const trimmed = raw.replace(/[\s\u00A0\u200B().-]/g, '');
  if (trimmed === '') return null;

  let digits: string;
  if (trimmed.startsWith('+')) {
    digits = trimmed.slice(1);
  } else if (trimmed.startsWith('00')) {
    digits = trimmed.slice(2);
  } else if (/^\d{10}$/.test(trimmed)) {
    digits = COLOMBIA + trimmed;
  } else if (/^1\d{10}$/.test(trimmed)) {
    // Already carries its own country code, so it is prefixed by nothing.
    digits = trimmed;
  } else if (/^57\d{10}$/.test(trimmed)) {
    digits = trimmed;
  } else {
    return null;
  }

  if (!/^\d+$/.test(digits)) return null;

  const candidate = `+${digits}`;
  return E164.test(candidate) ? candidate : null;
}

/**
 * The digits wa.me wants: no plus, no punctuation.
 *
 * wa.me/+573001112233 does not resolve; wa.me/573001112233 does.
 */
export function waMeDigits(e164: string): string {
  return e164.replace(/\D/g, '');
}
