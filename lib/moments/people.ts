import type { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { TaggablePerson } from './types';

/**
 * T-MOM1: who the tagging picker offers for a session, read with the service
 * role for a caller canUploadToSession already admitted:
 *
 *   the host; confirmed participants with an account; guests (the T-JOIN1
 *   guest join, and "Quién llegó" names, which have no phone); and the
 *   session's invites ("Alguien que no está en Tribe").
 *
 * A guest already turned into an invite (same name, and the same phone when
 * the guest has one) shows once, as the invite. Never a banned, deleted or
 * test account.
 */
export type PeopleRows = {
  hostId: string | null;
  users: Array<{
    id: string;
    name: string | null;
    avatar_url: string | null;
    banned?: boolean | null;
    deleted_at?: string | null;
    is_test_account?: boolean | null;
  }>;
  participants: Array<{
    id: string;
    user_id: string | null;
    is_guest: boolean | null;
    guest_name: string | null;
    guest_phone: string | null;
    status: string | null;
  }>;
  invites: Array<{ id: string; display_name: string; phone: string | null; claimed_by: string | null }>;
};

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export function mergePeople(rows: PeopleRows): TaggablePerson[] {
  const usersById = new Map(
    rows.users.filter((u) => !u.banned && !u.deleted_at && !u.is_test_account).map((u) => [u.id, u])
  );
  const out: TaggablePerson[] = [];
  const host = rows.hostId ? usersById.get(rows.hostId) : undefined;
  if (host) out.push({ kind: 'host', id: host.id, name: host.name?.trim() || 'Anfitrión', avatarUrl: host.avatar_url });

  const seenUsers = new Set(host ? [host.id] : []);
  for (const p of rows.participants) {
    if (p.status !== 'confirmed' || !p.user_id || seenUsers.has(p.user_id)) continue;
    const u = usersById.get(p.user_id);
    if (!u) continue;
    seenUsers.add(u.id);
    out.push({ kind: 'user', id: u.id, name: u.name?.trim() || 'Atleta', avatarUrl: u.avatar_url });
  }

  const inviteKeys = new Set(rows.invites.map((i) => `${norm(i.display_name)}|${i.phone ?? ''}`));
  const inviteNames = new Set(rows.invites.map((i) => norm(i.display_name)));
  for (const p of rows.participants) {
    if (p.status !== 'confirmed' || p.user_id || !p.guest_name?.trim()) continue;
    const already = p.guest_phone
      ? inviteKeys.has(`${norm(p.guest_name)}|${p.guest_phone}`)
      : inviteNames.has(norm(p.guest_name));
    if (already) continue;
    out.push({ kind: 'guest', id: p.id, name: p.guest_name.trim(), hasPhone: !!p.guest_phone });
  }

  for (const i of rows.invites) {
    out.push({ kind: 'invite', id: i.id, name: i.display_name, hasPhone: !!i.phone, claimed: !!i.claimed_by });
  }
  return out;
}

export async function loadTaggablePeople(service: SupabaseClient, sessionId: string): Promise<TaggablePerson[]> {
  try {
    const [session, participants, invites] = await Promise.all([
      service.from('sessions').select('creator_id').eq('id', sessionId).maybeSingle(),
      service
        .from('session_participants')
        .select('id, user_id, is_guest, guest_name, guest_phone, status')
        .eq('session_id', sessionId),
      service
        .from('media_invites')
        .select('id, display_name, phone, claimed_by')
        .eq('session_id', sessionId)
        .order('created_at'),
    ]);
    const hostId = (session.data as { creator_id: string | null } | null)?.creator_id ?? null;
    const parts = (participants.data ?? []) as PeopleRows['participants'];
    const ids = [...new Set([hostId, ...parts.map((p) => p.user_id)].filter(Boolean))] as string[];
    const users = ids.length
      ? ((await service.from('users').select('id, name, avatar_url, banned, deleted_at, is_test_account').in('id', ids))
          .data ?? [])
      : [];
    return mergePeople({
      hostId,
      users: users as PeopleRows['users'],
      participants: parts,
      invites: (invites.data ?? []) as PeopleRows['invites'],
    });
  } catch (error) {
    logError(error, { action: 'moments.loadTaggablePeople', sessionId });
    return [];
  }
}
