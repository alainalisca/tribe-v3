import { normalizeWhatsApp } from '@/lib/pase/phone';

/**
 * T-JOIN1 Part B. A guest's WhatsApp number, as typed, to E.164 or nothing.
 *
 * Al, 2026-10-18: a Colombian mobile (10 digits starting with 3, with or
 * without +57) or an international number with its country code, stored as
 * E.164. Built on the pass's normaliser (lib/pase/phone.ts: spaces, dashes,
 * 00 for +, a US number typed without the plus), with one rule added: a
 * Colombian number must be a mobile, so a landline (604...) or a bare 10-digit
 * number from elsewhere is refused.
 *
 * The same rule runs in the browser (to tell the guest at once), in
 * /api/sessions/[id]/guest (the gate), and in join_session_as_guest after
 * migration 221 (which refuses anything not in E.164).
 */
const CO_MOBILE_E164 = /^\+573\d{9}$/;

export function normalizeGuestPhone(raw: string | null | undefined): string | null {
  const e164 = normalizeWhatsApp(raw);
  if (!e164) return null;
  if (e164.startsWith('+57') && !CO_MOBILE_E164.test(e164)) return null;
  return e164;
}
