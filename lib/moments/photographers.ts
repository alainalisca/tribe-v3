import type { SupabaseClient } from '@supabase/supabase-js';
import { HANDLE_PATTERN, normalizeHandle } from '@/lib/coachLink';
import { isVisibleUser, VISIBLE_USER_FLAGS } from '@/lib/dal/visibleUsers';
import { loadTaggablePeople } from './people';

/**
 * T-MOM1 Part C: "Fotógrafo de esta sesión". The host (or an admin) names
 * people who may upload and tag this session's photos: someone in the
 * session (its participants on Tribe), or anyone by their exact Tribe handle
 * (Al, 2026-10-19), never a search and never a test, banned or deleted
 * account. The host is never in the list: they can already.
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

/** "@Salomon " -> "salomon": the handle as users.handle stores it. Null when nothing is left. */
export function handleFromInput(raw: string): string | null {
  const h = normalizeHandle(raw.replace(/^\s*@/, ''));
  return HANDLE_PATTERN.test(h) ? h : null;
}

/**
 * Name a photographer by their Tribe handle. 'not_found' covers every account
 * that may not be named (no such handle, test, banned, deleted), so the answer
 * says nothing about which; 'host' is the session's own host.
 */
export async function grantPhotographerByHandle(
  service: SupabaseClient,
  sessionId: string,
  rawHandle: string,
  grantedBy: string,
  hostId: string | null
): Promise<{ ok: true } | { ok: false; error: 'not_found' | 'host' }> {
  const handle = handleFromInput(rawHandle);
  if (!handle) return { ok: false, error: 'not_found' };
  const { data } = await service
    .from('users')
    .select(`id, ${VISIBLE_USER_FLAGS}`)
    .eq('handle', handle)
    .maybeSingle();
  const user = data as ({ id: string } & Parameters<typeof isVisibleUser>[0]) | null;
  if (!isVisibleUser(user)) return { ok: false, error: 'not_found' };
  if (user.id === hostId) return { ok: false, error: 'host' };
  const { error } = await service
    .from('session_photographers')
    .upsert({ session_id: sessionId, user_id: user.id, granted_by: grantedBy }, { onConflict: 'session_id,user_id' });
  if (error) throw error;
  return { ok: true };
}
