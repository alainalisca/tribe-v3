import type { SupabaseClient } from '@supabase/supabase-js';
import { isVisibleUser, VISIBLE_USER_FLAGS } from '@/lib/dal/visibleUsers';
import { translateSport } from '@/lib/sportTranslationData';
import { signMoments } from './storage';

/**
 * T-MOM1 Part D: the "Momentos" strip on a coach's page (/i/<handle>).
 *
 * Only photos from the coach's own sessions that a person in them chose to
 * show ("Mostrar en la página de <coach>"): their tag delivered, not removed,
 * show_on_coach_page on, and they a listed account (never test, banned or
 * deleted). The coach cannot add to it; a removed tag or a switched-off choice
 * drops the photo on the next render. Never a test session, never a deleted
 * photo.
 *
 * DENSITY: the strip renders only with at least 3 such photos from at least 2
 * different people, so it never reads empty. 12 at most, newest first.
 */
export const STRIP_MIN_PHOTOS = 3;
export const STRIP_MIN_PEOPLE = 2;
export const STRIP_MAX = 12;

export type StripCandidate = { mediaId: string; userId: string; when: string };

/** The photos the strip shows, newest first, or null below the density rule. Pure. */
export function planCoachStrip(rows: StripCandidate[]): string[] | null {
  const newest = new Map<string, string>();
  for (const r of rows) if (!newest.has(r.mediaId) || r.when > newest.get(r.mediaId)!) newest.set(r.mediaId, r.when);
  const people = new Set(rows.map((r) => r.userId));
  if (newest.size < STRIP_MIN_PHOTOS || people.size < STRIP_MIN_PEOPLE) return null;
  return [...newest.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .slice(0, STRIP_MAX)
    .map(([id]) => id);
}

export type StripTile = { mediaId: string; gridUrl: string | null; viewerUrl: string | null; caption: string };

function caption(s: { title: string | null; sport: string | null; date: string }, lang: 'es' | 'en'): string {
  const what =
    s.title?.trim() ||
    (s.sport && s.sport !== 'Other' ? translateSport(s.sport, lang) : lang === 'en' ? 'Session' : 'Sesión');
  const d = new Date(`${s.date}T12:00:00Z`);
  const month = d
    .toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CO', { month: 'short', timeZone: 'UTC' })
    .replace('.', '');
  return `${what} · ${lang === 'en' ? `${month} ${d.getUTCDate()}` : `${d.getUTCDate()} ${month}`}`;
}

export async function loadCoachStrip(
  service: SupabaseClient,
  coachId: string,
  lang: 'es' | 'en'
): Promise<StripTile[] | null> {
  const { data: sessionData } = await service
    .from('sessions')
    .select('id, title, sport, date')
    .eq('creator_id', coachId)
    .eq('is_test', false);
  const sessions = (sessionData ?? []) as Array<{ id: string; title: string | null; sport: string | null; date: string }>;
  if (sessions.length === 0) return null;

  const { data: mediaData } = await service
    .from('session_media')
    .select('id, session_id, storage_path, taken_at, created_at')
    .in(
      'session_id',
      sessions.map((s) => s.id)
    )
    .is('deleted_at', null);
  const media = (mediaData ?? []) as Array<{
    id: string;
    session_id: string;
    storage_path: string;
    taken_at: string | null;
    created_at: string;
  }>;
  if (media.length < STRIP_MIN_PHOTOS) return null;

  const { data: tagData } = await service
    .from('session_media_tags')
    .select('media_id, user_id')
    .in(
      'media_id',
      media.map((m) => m.id)
    )
    .eq('show_on_coach_page', true)
    .not('delivered_at', 'is', null)
    .is('removed_at', null)
    .not('user_id', 'is', null);
  const tags = (tagData ?? []) as Array<{ media_id: string; user_id: string }>;
  if (tags.length < STRIP_MIN_PHOTOS) return null;

  const { data: userData } = await service
    .from('users')
    .select(`id, ${VISIBLE_USER_FLAGS}`)
    .in('id', [...new Set(tags.map((t) => t.user_id))]);
  const listed = new Set(
    ((userData ?? []) as Array<{ id: string } & Parameters<typeof isVisibleUser>[0]>)
      .filter((u) => isVisibleUser(u))
      .map((u) => u!.id)
  );
  const byId = new Map(media.map((m) => [m.id, m]));
  const plan = planCoachStrip(
    tags
      .filter((t) => listed.has(t.user_id))
      .map((t) => {
        const m = byId.get(t.media_id)!;
        return { mediaId: m.id, userId: t.user_id, when: m.taken_at ?? m.created_at };
      })
  );
  if (!plan) return null;

  const sessionOf = new Map(sessions.map((s) => [s.id, s]));
  const paths = plan.map((id) => byId.get(id)!.storage_path);
  const [grid, viewer] = await Promise.all([signMoments(service, paths, 'grid'), signMoments(service, paths, 'viewer')]);
  return plan.map((id) => {
    const m = byId.get(id)!;
    return {
      mediaId: id,
      gridUrl: grid[m.storage_path] ?? null,
      viewerUrl: viewer[m.storage_path] ?? null,
      caption: caption(sessionOf.get(m.session_id)!, lang),
    };
  });
}
