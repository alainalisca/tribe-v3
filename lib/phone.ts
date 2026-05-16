/**
 * Phone-number normalization for WhatsApp deep-links.
 *
 * WhatsApp's wa.me/<digits> format expects the international phone
 * number as digits only — no `+`, no spaces, no dashes, no parens.
 * Instructors enter numbers in all kinds of formats:
 *   "+57 300 123 4567"   (Colombia, common UI format)
 *   "(305) 555-0123"     (US, parens style)
 *   "300 1234567"        (Colombia local style — no country code)
 *   "+1-305-555-0123"    (US, hyphenated)
 *
 * This module gives the UI a single helper to turn whatever's in the
 * `clients.phone` column into a `wa.me` link without forcing the
 * instructor to clean up their data first.
 *
 * Limitations:
 *   - We never *guess* a country code. If the input doesn't already
 *     start with a country code, we apply a single configured default
 *     country code (CO = 57, since the primary market is Medellín).
 *     Callers who care can pass a different default.
 *   - We don't validate that the result is a real, dialable number.
 *     wa.me itself will reject invalid numbers gracefully.
 */

/**
 * Country code applied when the input phone number doesn't already
 * include one. Defaults to Colombia (57). Adjust the call site to
 * pass `defaultCountryCode: '1'` for a US instructor, etc.
 */
const DEFAULT_COUNTRY_CODE = '57';

/**
 * Strips every non-digit character. Useful when you just need digits
 * (e.g. for a wa.me URL) but you don't want to apply a country code
 * default — for those cases use `normalizeForWhatsApp` instead.
 */
export function digitsOnly(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/[^\d]/g, '');
}

/**
 * Normalizes a phone string to the digits-only format wa.me expects.
 *
 * Heuristic:
 *   - Strip non-digits.
 *   - If the original input started with `+`, treat what follows as a
 *     full international number already; return digits as-is.
 *   - If the input had no `+`, assume the digits include or are missing
 *     the country code:
 *       - If the digit count looks like a US number (10 digits) and
 *         the default country code is '1', prepend '1'.
 *       - If the digit count looks like a Colombian mobile (10 digits
 *         starting with '3') and the default is '57', prepend '57'.
 *       - Otherwise leave it alone — wa.me will fail gracefully and
 *         the user can fix the data.
 *
 * Returns an empty string when the input is empty or contains no
 * digits at all (the caller is expected to hide the WhatsApp button
 * in that case).
 */
export function normalizeForWhatsApp(
  phone: string | null | undefined,
  options: { defaultCountryCode?: string } = {}
): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  if (!trimmed) return '';

  const startsWithPlus = trimmed.startsWith('+');
  const digits = digitsOnly(trimmed);
  if (!digits) return '';

  if (startsWithPlus) {
    return digits;
  }

  const cc = options.defaultCountryCode ?? DEFAULT_COUNTRY_CODE;

  // Already starts with this country code: assume the user typed it
  // without a leading +. Return as-is.
  if (digits.startsWith(cc)) {
    return digits;
  }

  // US numbers: 10 digits without country code. Only auto-prepend
  // when the configured default is actually US.
  if (cc === '1' && digits.length === 10) {
    return `1${digits}`;
  }

  // Colombian mobiles: 10 digits starting with 3.
  if (cc === '57' && digits.length === 10 && digits.startsWith('3')) {
    return `57${digits}`;
  }

  // Fallback — let wa.me handle it. The user may have data that's
  // already in the right format, or the number just won't link
  // and they'll fix the data and retry.
  return digits;
}

/**
 * Builds a wa.me deep-link with an optional pre-filled message. Returns
 * null when the phone can't be normalized to anything usable — callers
 * should hide the WhatsApp affordance in that case rather than render
 * a broken link.
 */
export function buildWhatsAppUrl(
  phone: string | null | undefined,
  options: { message?: string; defaultCountryCode?: string } = {}
): string | null {
  const digits = normalizeForWhatsApp(phone, { defaultCountryCode: options.defaultCountryCode });
  if (!digits) return null;
  const base = `https://wa.me/${digits}`;
  if (options.message && options.message.trim().length > 0) {
    return `${base}?text=${encodeURIComponent(options.message)}`;
  }
  return base;
}
