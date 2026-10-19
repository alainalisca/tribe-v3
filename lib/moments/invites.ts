import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
export { checkInvite, type InviteInput, type InviteCheck } from './inviteCheck';

/**
 * T-MOM1: "Alguien que no está en Tribe". A name (required, 80 characters at
 * most) and an optional WhatsApp number, validated like the T-JOIN1 guest
 * modal (lib/guestPhone). The token is 32 random letters and digits; the link
 * /m/<token>/ (Part C) is the only way to it. 30 days to claim (the table's
 * default).
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function newInviteToken(): string {
  // Rejection sampling: 248 = 62 * 4, so every accepted byte maps evenly.
  let out = '';
  while (out.length < 32) {
    for (const b of randomBytes(48)) {
      if (b < 248 && out.length < 32) out += ALPHABET[b % 62];
    }
  }
  return out;
}

export async function createInvite(
  service: SupabaseClient,
  args: { sessionId: string; name: string; phone: string | null; createdBy: string }
): Promise<{ id: string; display_name: string; phone: string | null } | null> {
  const { data, error } = await service
    .from('media_invites')
    .insert({
      session_id: args.sessionId,
      display_name: args.name,
      phone: args.phone,
      token: newInviteToken(),
      created_by: args.createdBy,
    })
    .select('id, display_name, phone')
    .single();
  if (error) throw error;
  return data as { id: string; display_name: string; phone: string | null } | null;
}
