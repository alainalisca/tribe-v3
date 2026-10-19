import type { SupabaseClient } from '@supabase/supabase-js';
import { signMoments } from './storage';
import { loadTaggablePeople } from './people';
import type { MomentItem, MomentTag, SessionMomentsState } from './types';

/**
 * T-MOM1: everything the upload and tagging screen shows for a session, for a
 * caller canUploadToSession admitted: the photos (not deleted, oldest first,
 * each with a 1-hour signed w400 URL) with their tags, and the people the
 * picker offers.
 */
type MediaRow = {
  id: string;
  storage_path: string;
  width: number | null;
  height: number | null;
  uploader_id: string;
  created_at: string;
};
type TagRow = {
  id: string;
  media_id: string;
  user_id: string | null;
  invite_id: string | null;
  delivered_at: string | null;
  removed_at: string | null;
};

export function assembleMoments(
  media: MediaRow[],
  tags: TagRow[],
  names: Map<string, string>,
  gridUrls: Record<string, string | null>
): MomentItem[] {
  const byMedia = new Map<string, MomentTag[]>();
  for (const t of tags) {
    const kind = t.user_id ? 'user' : 'invite';
    const personId = (t.user_id ?? t.invite_id) as string;
    const list = byMedia.get(t.media_id) ?? [];
    list.push({
      id: t.id,
      kind,
      personId,
      name: names.get(`${kind}:${personId}`) ?? '',
      delivered: !!t.delivered_at,
      removed: !!t.removed_at,
    });
    byMedia.set(t.media_id, list);
  }
  return media.map((m) => ({
    id: m.id,
    gridUrl: gridUrls[m.storage_path] ?? null,
    width: m.width,
    height: m.height,
    uploaderId: m.uploader_id,
    createdAt: m.created_at,
    tags: byMedia.get(m.id) ?? [],
  }));
}

export async function loadSessionMoments(service: SupabaseClient, sessionId: string): Promise<SessionMomentsState> {
  const [{ data: media, error }, people] = await Promise.all([
    service
      .from('session_media')
      .select('id, storage_path, width, height, uploader_id, created_at')
      .eq('session_id', sessionId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    loadTaggablePeople(service, sessionId),
  ]);
  if (error) throw error;
  const rows = (media ?? []) as MediaRow[];
  const tags = rows.length
    ? (((
        await service
          .from('session_media_tags')
          .select('id, media_id, user_id, invite_id, delivered_at, removed_at')
          .in(
            'media_id',
            rows.map((m) => m.id)
          )
      ).data ?? []) as TagRow[])
    : [];
  const names = new Map<string, string>();
  for (const p of people) names.set(`${p.kind === 'host' ? 'user' : p.kind}:${p.id}`, p.name);
  // A tagged user who is no longer on the roster still needs a name on screen.
  const missing = [
    ...new Set(tags.filter((t) => t.user_id && !names.has(`user:${t.user_id}`)).map((t) => t.user_id as string)),
  ];
  if (missing.length) {
    const { data } = await service.from('users').select('id, name').in('id', missing);
    for (const u of (data ?? []) as Array<{ id: string; name: string | null }>) names.set(`user:${u.id}`, u.name ?? '');
  }
  const gridUrls = await signMoments(
    service,
    rows.map((m) => m.storage_path),
    'grid'
  );
  return { sessionId, media: assembleMoments(rows, tags, names, gridUrls), people };
}
