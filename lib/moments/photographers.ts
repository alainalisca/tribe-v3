import type { SupabaseClient } from '@supabase/supabase-js';
import { loadTaggablePeople } from './people';

/**
 * T-MOM1 Part C: "Fotógrafo de esta sesión". The host (or an admin) names
 * people who may upload and tag this session's photos. They are picked from
 * the people in the session (its participants on Tribe), never by searching
 * every account. The host is never in the list: they can already.
 */
export type PhotographerPerson = { id: string; name: string; avatarUrl: string | null };
export type PhotographersState = { photographers: PhotographerPerson[]; candidates: PhotographerPerson[] };

/** Split the session's people: who is a photographer, who could be. Pure. */
export function splitPhotographers(
  people: Array<{ kind: string; id: string; name: string; avatarUrl?: string | null }>,
  photographerIds: Set<string>,
  extra: PhotographerPerson[]
): PhotographersState {
  const users = people
    .filter((p) => p.kind === 'user')
    .map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl ?? null }));
  const known = new Set(users.map((u) => u.id));
  return {
    // A photographer who left the roster is still listed, so they can be removed.
    photographers: [...users.filter((u) => photographerIds.has(u.id)), ...extra.filter((e) => !known.has(e.id))],
    candidates: users.filter((u) => !photographerIds.has(u.id)),
  };
}

export async function loadPhotographers(service: SupabaseClient, sessionId: string): Promise<PhotographersState> {
  const [people, { data }] = await Promise.all([
    loadTaggablePeople(service, sessionId),
    service.from('session_photographers').select('user_id').eq('session_id', sessionId),
  ]);
  const ids = new Set(((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
  const onRoster = new Set(people.filter((p) => p.kind === 'user').map((p) => p.id));
  const missing = [...ids].filter((id) => !onRoster.has(id));
  const extra: PhotographerPerson[] = missing.length
    ? (((await service.from('users').select('id, name, avatar_url').in('id', missing)).data ?? []) as Array<{
        id: string;
        name: string | null;
        avatar_url: string | null;
      }>).map((u) => ({ id: u.id, name: u.name ?? '', avatarUrl: u.avatar_url }))
    : [];
  return splitPhotographers(people, ids, extra);
}

/** Name a photographer: only someone in the session. Returns false when they are not. */
export async function grantPhotographer(
  service: SupabaseClient,
  sessionId: string,
  userId: string,
  grantedBy: string
): Promise<boolean> {
  const people = await loadTaggablePeople(service, sessionId);
  if (!people.some((p) => p.kind === 'user' && p.id === userId)) return false;
  const { error } = await service
    .from('session_photographers')
    .upsert({ session_id: sessionId, user_id: userId, granted_by: grantedBy }, { onConflict: 'session_id,user_id' });
  if (error) throw error;
  return true;
}

export async function revokePhotographer(service: SupabaseClient, sessionId: string, userId: string): Promise<void> {
  const { error } = await service
    .from('session_photographers')
    .delete()
    .eq('session_id', sessionId)
    .eq('user_id', userId);
  if (error) throw error;
}
