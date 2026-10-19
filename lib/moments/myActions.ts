import type { SupabaseClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rate-limit';
import { hostFirstName } from '@/lib/share/sessionPublic';
import { notifyUploader } from './notify';
import { MOMENTS_BUCKET, momentVariantPath } from './paths';
import { signMoments } from './storage';

/**
 * T-MOM1 Part C: what a tagged person can do with a photo of them, from the
 * viewer. Every action starts from THEIR tag on that photo: delivered, not
 * removed, on a photo nobody deleted. No tag, no action (the route answers 404
 * and says nothing about whether the photo exists).
 *
 *   Descargar            a signed URL to the original, as a download
 *   Gracias              thanked_at; the uploader hears once per batch
 *                        (the first thanks for their photos of that session)
 *   Quitarme de esta foto  removed_at; the uploader is NOT told
 *   Pedir que la borren  removed_at as well, and the uploader is asked to
 *                        delete it (once per photo per person)
 *   Compartir            the story image (Part D)
 *   Mostrar en la página de <coach>   show_on_coach_page (Part D)
 */
export type MyTag = {
  tagId: string;
  thankedAt: string | null;
  media: { id: string; session_id: string; storage_path: string; uploader_id: string };
};

export async function loadMyTag(service: SupabaseClient, userId: string, mediaId: string): Promise<MyTag | null> {
  const { data: tag } = await service
    .from('session_media_tags')
    .select('id, thanked_at, delivered_at, removed_at')
    .eq('media_id', mediaId)
    .eq('user_id', userId)
    .maybeSingle();
  const t = tag as { id: string; thanked_at: string | null; delivered_at: string | null; removed_at: string | null } | null;
  if (!t || !t.delivered_at || t.removed_at) return null;
  const { data: media } = await service
    .from('session_media')
    .select('id, session_id, storage_path, uploader_id, deleted_at')
    .eq('id', mediaId)
    .maybeSingle();
  const m = media as (MyTag['media'] & { deleted_at: string | null }) | null;
  if (!m || m.deleted_at) return null;
  return {
    tagId: t.id,
    thankedAt: t.thanked_at,
    media: { id: m.id, session_id: m.session_id, storage_path: m.storage_path, uploader_id: m.uploader_id },
  };
}

export async function downloadUrl(service: SupabaseClient, tag: MyTag): Promise<string | null> {
  const urls = await signMoments(service, [tag.media.storage_path], 'original', true);
  return urls[tag.media.storage_path] ?? null;
}

/** The uploader hears about thanks once per batch: only the first thanks, and never for their own photos. */
export function shouldNotifyThanks(a: { alreadyThankedInBatch: number; uploaderId: string; userId: string }): boolean {
  return a.alreadyThankedInBatch === 0 && a.uploaderId !== a.userId;
}

async function sessionFor(service: SupabaseClient, sessionId: string) {
  const { data } = await service.from('sessions').select('id, title, sport, date').eq('id', sessionId).maybeSingle();
  return data as { id: string; title: string | null; sport: string | null; date: string } | null;
}

async function nameOf(service: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await service.from('users').select('name').eq('id', userId).maybeSingle();
  return (data as { name: string | null } | null)?.name ?? null;
}

export async function thankForPhoto(
  service: SupabaseClient,
  userId: string,
  tag: MyTag
): Promise<{ thanked: true; notified: boolean }> {
  if (tag.thankedAt) return { thanked: true, notified: false };
  // The batch: this uploader's photos of this session.
  const { data: batch } = await service
    .from('session_media')
    .select('id')
    .eq('session_id', tag.media.session_id)
    .eq('uploader_id', tag.media.uploader_id);
  const ids = ((batch ?? []) as Array<{ id: string }>).map((m) => m.id);
  const { count } = ids.length
    ? await service
        .from('session_media_tags')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('media_id', ids)
        .not('thanked_at', 'is', null)
    : { count: 0 };
  const { error } = await service
    .from('session_media_tags')
    .update({ thanked_at: new Date().toISOString() })
    .eq('id', tag.tagId);
  if (error) throw error;
  const notify = shouldNotifyThanks({
    alreadyThankedInBatch: count ?? 0,
    uploaderId: tag.media.uploader_id,
    userId,
  });
  if (notify) {
    const session = await sessionFor(service, tag.media.session_id);
    if (session)
      await notifyUploader(service, {
        kind: 'thanks',
        uploaderId: tag.media.uploader_id,
        actorId: userId,
        actorName: await nameOf(service, userId),
        session,
      });
  }
  return { thanked: true, notified: notify };
}

const DELETE_REQUEST_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function removeMeFromPhoto(
  service: SupabaseClient,
  userId: string,
  tag: MyTag,
  requestDelete: boolean
): Promise<{ removed: true; requested: boolean }> {
  const { error } = await service
    .from('session_media_tags')
    .update({ removed_at: new Date().toISOString(), show_on_coach_page: false })
    .eq('id', tag.tagId);
  if (error) throw error;
  if (!requestDelete || tag.media.uploader_id === userId) return { removed: true, requested: false };
  const once = await checkRateLimit(service, `moments-delreq:${userId}:${tag.media.id}`, 1, DELETE_REQUEST_WINDOW_MS);
  if (!once.allowed) return { removed: true, requested: false };
  const session = await sessionFor(service, tag.media.session_id);
  if (session)
    await notifyUploader(service, {
      kind: 'delete_request',
      uploaderId: tag.media.uploader_id,
      actorId: userId,
      actorName: await nameOf(service, userId),
      session,
    });
  return { removed: true, requested: true };
}

/**
 * T-MOM1 Part D: what the story image needs for one of the person's photos:
 * the w1200 file, the host's first name, the session's gym when approved and
 * active, and the person's language. Only ever reached through their own tag.
 */
export async function storyInputs(
  service: SupabaseClient,
  userId: string,
  tag: MyTag
): Promise<{ photo: Buffer; coach: string; gym: string | null; lang: 'es' | 'en' } | null> {
  const [{ data: file }, { data: s }, { data: me }] = await Promise.all([
    service.storage.from(MOMENTS_BUCKET).download(momentVariantPath(tag.media.storage_path, 'viewer')),
    service
      .from('sessions')
      .select('sport, creator_id, partner_id, partner_status')
      .eq('id', tag.media.session_id)
      .maybeSingle(),
    service.from('users').select('preferred_language').eq('id', userId).maybeSingle(),
  ]);
  if (!file) return null;
  const session = s as {
    sport: string | null;
    creator_id: string | null;
    partner_id: string | null;
    partner_status: string | null;
  } | null;
  const [{ data: host }, { data: partner }] = await Promise.all([
    session?.creator_id
      ? service.from('users').select('name').eq('id', session.creator_id).maybeSingle()
      : Promise.resolve({ data: null }),
    session?.partner_id && session.partner_status === 'approved'
      ? service.from('featured_partners').select('business_name, status').eq('id', session.partner_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const p = partner as { business_name: string | null; status: string | null } | null;
  return {
    photo: Buffer.from(await file.arrayBuffer()),
    coach: hostFirstName((host as { name: string | null } | null)?.name ?? null, session?.sport ?? null),
    gym: p?.status === 'active' ? (p.business_name?.trim() ?? null) : null,
    lang: (me as { preferred_language?: string | null } | null)?.preferred_language === 'en' ? 'en' : 'es',
  };
}

/** "Mostrar en la página de <coach>": the person's own choice, on their own tag. */
export async function setShowOnCoachPage(service: SupabaseClient, tag: MyTag, show: boolean): Promise<void> {
  const { error } = await service.from('session_media_tags').update({ show_on_coach_page: show }).eq('id', tag.tagId);
  if (error) throw error;
}
