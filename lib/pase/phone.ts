/**
 * WhatsApp number normalisation for the digital pass.
 *
 * Everything that reaches pass_leads.whatsapp is E.164, because the row's
 * whole purpose is a wa.me link the partner taps, and wa.me takes digits with
 * a country code and nothing else. The same person writing "300 111 2233",
 * "+57 300 111 2233" and "300-111-2233" must produce one value, or Leo sees
 * three leads and cannot tell they are one person.
 *
 * COLOMBIA IS THE DEFAULT, NOT THE ONLY OPTION. A bare 10-digit number is
 * Colombian (the mobile plan is 3XXXXXXXXX), which covers the Medellín
 * audience these passes are printed for. An explicit + is honoured as written,
 * so a visitor from anywhere can still claim a pass.
 */

/** Colombia. The only country we infer rather than read. */
const DEFAULT_COUNTRY_CODE = '57';

/**
 * E.164: a leading +, a non-zero first digit, 8 to 15 digits total. Matches
 * pass_leads_whatsapp_e164 in migration 173 -- if these two ever disagree the
 * database wins and the insert fails, so they are deliberately identical.
 */
const E164 = /^\+[1-9][0-9]{7,14}$/;

/**
 * Normalise a typed WhatsApp number to E.164, or null if it cannot be.
 *
 * Returning null rather than throwing: the caller turns this into one field
 * error on a form, and a thrown exception there would be indistinguishable
 * from a bug.
 */
export function normalizeWhatsApp(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;

  // Strip everything a person might type as punctuation or grouping, including
  // the (0) some people copy out of an international format. Unicode spaces
  // are in here because a pasted number from WhatsApp itself often carries
  // U+00A0.
  const trimmed = raw.replace(/[\s ​().-]/g, '');
  if (trimmed === '') return null;

  // An explicit country code, however it was written. 00 is the international
  // prefix used across Latin America and reads as + to the person typing it.
  let digits: string;
  if (trimmed.startsWith('+')) {
    digits = trimmed.slice(1);
  } else if (trimmed.startsWith('00')) {
    digits = trimmed.slice(2);
  } else if (/^\d{10}$/.test(trimmed)) {
    // A bare Colombian mobile. This is the common case on the printed QR.
    digits = DEFAULT_COUNTRY_CODE + trimmed;
  } else if (/^57\d{10}$/.test(trimmed)) {
    // Someone typed the country code without a plus.
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
