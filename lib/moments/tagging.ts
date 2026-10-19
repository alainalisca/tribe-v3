import type { SupabaseClient } from '@supabase/supabase-js';
import { createInvite } from './invites';
import { loadTaggablePeople } from './people';
import type { TagTarget } from './types';

/**
 * T-MOM1: tag or untag several photos at once ("Etiquetar a", "Todas las
 * fotos"). The caller has passed canUploadToSession.
 *
 *   - Only photos of this session that are not deleted.
 *   - Only people the picker offers for this session (host, confirmed
 *     participants, guests, the session's invites): a crafted request cannot
 *     tag an arbitrary account.
 *   - A guest becomes an invite the first time they are tagged (name and the
 *     phone the guest gave, if any), and that invite is reused afterwards.
 *   - A person who removed themselves from a photo ("Quitarme de esta foto")
 *     is never tagged on it again, and their row stays so it cannot be.
 *   - Untagging deletes the tag (before or after delivery): the photo simply
 *     leaves that person's Momentos.
 */
export type TagRow = {
  id: string;
  media_id: string;
  user_id: string | null;
  invite_id: string | null;
  removed_at: string | null;
};

export function subjectOf(t: { user_id: string | null; invite_id: string | null }): string {
  return t.user_id ? `user:${t.user_id}` : `invite:${t.invite_id}`;
}

/** Which rows to insert and delete for a set of photos and people. Pure. */
export function planTagChanges(args: {
  mediaIds: string[];
  subjects: Array<{ kind: 'user' | 'invite'; id: string }>;
  existing: TagRow[];
  mode: 'add' | 'remove';
}): { insert: Array<{ media_id: string; user_id: string | null; invite_id: string | null }>; deleteIds: string[] } {
  const byKey = new Map(args.existing.map((t) => [`${t.media_id}|${subjectOf(t)}`, t]));
  const insert: Array<{ media_id: string; user_id: string | null; invite_id: string | null }> = [];
  const deleteIds: string[] = [];
  for (const media_id of args.mediaIds) {
    for (const s of args.subjects) {
      const key = `${media_id}|${s.kind}:${s.id}`;
      const row = byKey.get(key);
      if (args.mode === 'add') {
        if (!row)
          insert.push({
            media_id,
            user_id: s.kind === 'user' ? s.id : null,
            invite_id: s.kind === 'invite' ? s.id : null,
          });
      } else if (row && !row.removed_at) {
        deleteIds.push(row.id);
      }
    }
  }
  return { insert, deleteIds };
}

export async function applyTags(
  service: SupabaseClient,
  args: { sessionId: string; mediaIds: string[]; targets: TagTarget[]; mode: 'add' | 'remove'; actorId: string }
): Promise<{ added: number; removed: number }> {
  const { data: media, error: mErr } = await service
    .from('session_media')
    .select('id')
    .eq('session_id', args.sessionId)
    .is('deleted_at', null)
    .in('id', args.mediaIds);
  if (mErr) throw mErr;
  const mediaIds = (media ?? []).map((m: { id: string }) => m.id);
  if (mediaIds.length === 0 || args.targets.length === 0) return { added: 0, removed: 0 };

  const people = await loadTaggablePeople(service, args.sessionId);
  const allowedUsers = new Set(people.filter((p) => p.kind === 'host' || p.kind === 'user').map((p) => p.id));
  const allowedInvites = new Set(people.filter((p) => p.kind === 'invite').map((p) => p.id));
  const guests = new Map(people.filter((p) => p.kind === 'guest').map((p) => [p.id, p]));

  const subjects: Array<{ kind: 'user' | 'invite'; id: string }> = [];
  for (const t of args.targets) {
    if (t.kind === 'user' && allowedUsers.has(t.id)) subjects.push({ kind: 'user', id: t.id });
    else if (t.kind === 'invite' && allowedInvites.has(t.id)) subjects.push({ kind: 'invite', id: t.id });
    else if (t.kind === 'guest' && guests.has(t.id) && args.mode === 'add') {
      const { data: guest } = await service
        .from('session_participants')
        .select('guest_name, guest_phone')
        .eq('id', t.id)
        .eq('session_id', args.sessionId)
        .maybeSingle();
      const g = guest as { guest_name: string | null; guest_phone: string | null } | null;
      if (!g?.guest_name) continue;
      const invite = await createInvite(service, {
        sessionId: args.sessionId,
        name: g.guest_name.trim().slice(0, 80),
        phone: g.guest_phone ?? null,
        createdBy: args.actorId,
      });
      if (invite) subjects.push({ kind: 'invite', id: invite.id });
    }
  }
  if (subjects.length === 0) return { added: 0, removed: 0 };

  const { data: existing, error: tErr } = await service
    .from('session_media_tags')
    .select('id, media_id, user_id, invite_id, removed_at')
    .in('media_id', mediaIds);
  if (tErr) throw tErr;
  const plan = planTagChanges({ mediaIds, subjects, existing: (existing ?? []) as TagRow[], mode: args.mode });
  if (plan.insert.length) {
    const { error } = await service
      .from('session_media_tags')
      .insert(plan.insert.map((r) => ({ ...r, tagged_by: args.actorId })));
    if (error) throw error;
  }
  if (plan.deleteIds.length) {
    const { error } = await service.from('session_media_tags').delete().in('id', plan.deleteIds);
    if (error) throw error;
  }
  return { added: plan.insert.length, removed: plan.deleteIds.length };
}
