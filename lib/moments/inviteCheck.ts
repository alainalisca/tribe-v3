import { normalizeGuestPhone } from '@/lib/guestPhone';

/**
 * T-MOM1: "Alguien que no está en Tribe", checked the same way in the browser
 * (to say so at once) and in the route (the gate). A name, 80 characters at
 * most, and an optional WhatsApp number validated like the T-JOIN1 guest modal.
 */
export type InviteInput = { name: string; phone?: string | null };
export type InviteCheck =
  | { ok: true; name: string; phone: string | null }
  | { ok: false; error: 'name_required' | 'name_too_long' | 'invalid_phone' };

export function checkInvite(input: InviteInput): InviteCheck {
  const name = (input.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, error: 'name_required' };
  if (name.length > 80) return { ok: false, error: 'name_too_long' };
  const raw = (input.phone ?? '').trim();
  if (!raw) return { ok: true, name, phone: null };
  const phone = normalizeGuestPhone(raw);
  return phone ? { ok: true, name, phone } : { ok: false, error: 'invalid_phone' };
}
