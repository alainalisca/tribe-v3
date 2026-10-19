import type { SupabaseClient } from '@supabase/supabase-js';
import { signMoments } from './storage';
import type { MyMomentsBatch } from './types';

/**
 * T-MOM1 Part C: a person's own Momentos. Only photos they are tagged in, after
 * "Entregar" (delivered_at set), that they have not removed themselves from,
 * on photos nobody deleted. Grouped by session, newest session first; inside a
 * session, in the order the photos were taken. Never anybody else's view: the
 * caller passes the signed-in user's id, and nothing here takes another.
 */
export type MyTagRow = { media_id: string; thanked_at: string | null };
export type MyMediaRow = {
  id: string;
  session_id: string;
  storage_path: string;
  width: number | null;
  height: number | null;
  taken_at: string | null;
  created_at: string;
};
export type MySessionRow = {
  id: string;
  title: string | null;
  sport: string | null;
  date: string;
  start_time: string | null;
  creator_id: string | null;
};

export function groupMyMoments(
  tags: MyTagRow[],
  media: MyMediaRow[],
  sessions: MySessionRow[],
  hostNames: Map<string, string>,
  grid: Record<string, string | null>,
  viewer: Record<string, string | null>
): MyMomentsBatch[] {
  const thanked = new Map(tags.map((t) => [t.media_id, !!t.thanked_at]));
  const bySession = new Map<string, MyMediaRow[]>();
  for (const m of media) {
    if (!thanked.has(m.id)) continue; // not this person's photo
    const list = bySession.get(m.session_id) ?? [];
    list.push(m);
    bySession.set(m.session_id, list);
  }
  const when = (m: MyMediaRow) => m.taken_at ?? m.created_at;
  return sessions
    .filter((s) => bySession.has(s.id))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.start_time ?? '').localeCompare(a.start_time ?? ''))
    .map((s) => ({
      sessionId: s.id,
      title: s.title,
      sport: s.sport,
      date: s.date,
      coachName: s.creator_id ? (hostNames.get(s.creator_id) ?? null) : null,
      photos: bySession
        .get(s.id)!
        .sort((a, b) => when(a).localeCompare(when(b)))
        .map((m) => ({
          mediaId: m.id,
          gridUrl: grid[m.storage_path] ?? null,
          viewerUrl: viewer[m.storage_path] ?? null,
          width: m.width,
          height: m.height,
          thanked: thanked.get(m.id) ?? false,
        })),
    }));
}

export async function loadMyMoments(service: SupabaseClient, userId: string): Promise<MyMomentsBatch[]> {
  const { data: tagData, error } = await service
    .from('session_media_tags')
    .select('media_id, thanked_at')
    .eq('user_id', userId)
    .not('delivered_at', 'is', null)
    .is('removed_at', null);
  if (error) throw error;
  const tags = (tagData ?? []) as MyTagRow[];
  if (tags.length === 0) return [];

  const { data: mediaData, error: mErr } = await service
    .from('session_media')
    .select('id, session_id, storage_path, width, height, taken_at, created_at')
    .in(
      'id',
      tags.map((t) => t.media_id)
    )
    .is('deleted_at', null);
  if (mErr) throw mErr;
  const media = (mediaData ?? []) as MyMediaRow[];
  if (media.length === 0) return [];

  const { data: sessionData, error: sErr } = await service
    .from('sessions')
    .select('id, title, sport, date, start_time, creator_id')
    .in('id', [...new Set(media.map((m) => m.session_id))]);
  if (sErr) throw sErr;
  const sessions = (sessionData ?? []) as MySessionRow[];

  const hostIds = [...new Set(sessions.map((s) => s.creator_id).filter((x): x is string => !!x))];
  const hostNames = new Map<string, string>();
  if (hostIds.length) {
    const { data } = await service.from('users').select('id, name').in('id', hostIds);
    for (const u of (data ?? []) as Array<{ id: string; name: string | null }>) hostNames.set(u.id, u.name ?? '');
  }

  const paths = media.map((m) => m.storage_path);
  const [grid, viewer] = await Promise.all([signMoments(service, paths, 'grid'), signMoments(service, paths, 'viewer')]);
  return groupMyMoments(tags, media, sessions, hostNames, grid, viewer);
}
