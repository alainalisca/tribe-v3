import type { SupabaseClient } from '@supabase/supabase-js';
import { MOMENTS_BUCKET, momentVariantPath } from './paths';
import { signMoments } from './storage';

/**
 * T-MOM1 Part C: the claim link, /m/<token>/, which the uploader sends a
 * person who is not on Tribe ("Enviar por WhatsApp").
 *
 * The page shows the session, "Tienes N fotos de <sesión> con <coach>", ONE
 * photo in full (the first the invite is tagged in) and the rest as blurred
 * tiles. The blur happens here, on the server: the tiles are 24 px wide
 * thumbnails, so the real photos never reach a browser before the person signs
 * up. Only the invite's own delivered tags count; never another photo of the
 * session.
 *
 * "Ver mis fotos" signs them up and comes back to /m/<token>/claim/, which
 * claims the invite (once, for the first account that does) and moves its tags
 * to that account. 30 days after it was created, or once claimed by someone
 * else, the link shows a plain message.
 */
export const INVITE_TOKEN = /^[A-Za-z0-9]{32}$/;

/** Views of claim links per IP per hour (the spec's rate limit). */
export const CLAIM_VIEWS_PER_HOUR = 20;

export type InviteRow = {
  id: string;
  session_id: string;
  display_name: string;
  claimed_by: string | null;
  expires_at: string;
};
export type InviteStatus = 'ok' | 'mine' | 'not_found' | 'expired' | 'claimed';

/** What the link may do for `userId` (null when signed out). */
export function inviteStatus(inv: InviteRow | null, userId: string | null, now: Date = new Date()): InviteStatus {
  if (!inv) return 'not_found';
  if (inv.claimed_by) return userId && inv.claimed_by === userId ? 'mine' : 'claimed';
  if (new Date(inv.expires_at) <= now) return 'expired';
  return 'ok';
}

export async function loadInvite(service: SupabaseClient, token: string): Promise<InviteRow | null> {
  if (!INVITE_TOKEN.test(token)) return null;
  const { data } = await service
    .from('media_invites')
    .select('id, session_id, display_name, claimed_by, expires_at')
    .eq('token', token)
    .maybeSingle();
  return (data as InviteRow | null) ?? null;
}

/** The invite's delivered photos, not removed, not deleted, in the order taken. */
async function invitePhotos(service: SupabaseClient, inviteId: string): Promise<string[]> {
  const { data: tags } = await service
    .from('session_media_tags')
    .select('media_id')
    .eq('invite_id', inviteId)
    .not('delivered_at', 'is', null)
    .is('removed_at', null);
  const ids = ((tags ?? []) as Array<{ media_id: string }>).map((t) => t.media_id);
  if (ids.length === 0) return [];
  const { data: media } = await service
    .from('session_media')
    .select('storage_path, taken_at, created_at')
    .in('id', ids)
    .is('deleted_at', null);
  return ((media ?? []) as Array<{ storage_path: string; taken_at: string | null; created_at: string }>)
    .sort((a, b) => (a.taken_at ?? a.created_at).localeCompare(b.taken_at ?? b.created_at))
    .map((m) => m.storage_path);
}

/** How many blurred tiles the page shows at most; the count says the rest. */
export const MAX_TILES = 8;

/** A 24 px, heavily compressed copy of the grid variant, as a data URI. */
async function blurTile(service: SupabaseClient, storagePath: string): Promise<string | null> {
  const { data } = await service.storage.from(MOMENTS_BUCKET).download(momentVariantPath(storagePath, 'grid'));
  if (!data) return null;
  const sharp = (await import('sharp')).default;
  const tiny = await sharp(Buffer.from(await data.arrayBuffer()))
    .resize(24, 24, { fit: 'cover' })
    .webp({ quality: 40 })
    .toBuffer();
  return `data:image/webp;base64,${tiny.toString('base64')}`;
}

export type InvitePreview = {
  name: string;
  session: { id: string; title: string | null; sport: string | null; date: string; photo: string | null };
  coachName: string | null;
  count: number;
  firstUrl: string | null;
  tiles: string[];
};

export async function loadInvitePreview(service: SupabaseClient, inv: InviteRow): Promise<InvitePreview | null> {
  const paths = await invitePhotos(service, inv.id);
  if (paths.length === 0) return null;
  const { data: s } = await service
    .from('sessions')
    .select('id, title, sport, date, photos, creator_id')
    .eq('id', inv.session_id)
    .maybeSingle();
  const session = s as {
    id: string;
    title: string | null;
    sport: string | null;
    date: string;
    photos: string[] | null;
    creator_id: string | null;
  } | null;
  if (!session) return null;
  const { data: host } = session.creator_id
    ? await service.from('users').select('name').eq('id', session.creator_id).maybeSingle()
    : { data: null };
  const [first] = paths;
  const [viewer, tiles] = await Promise.all([
    signMoments(service, [first], 'viewer'),
    Promise.all(paths.slice(1, 1 + MAX_TILES).map((p) => blurTile(service, p).catch(() => null))),
  ]);
  return {
    name: inv.display_name,
    session: {
      id: session.id,
      title: session.title,
      sport: session.sport,
      date: session.date,
      photo: session.photos?.[0] ?? null,
    },
    coachName: (host as { name: string | null } | null)?.name ?? null,
    count: paths.length,
    firstUrl: viewer[first] ?? null,
    tiles: tiles.filter((t): t is string => !!t),
  };
}

/** Split an invite's tags: the ones that move to the user, and the ones the user already has on that photo. */
export function planClaim(
  inviteTags: Array<{ id: string; media_id: string }>,
  userMedia: Set<string>
): { move: string[]; drop: string[] } {
  const move: string[] = [];
  const drop: string[] = [];
  for (const t of inviteTags) (userMedia.has(t.media_id) ? drop : move).push(t.id);
  return { move, drop };
}

export type ClaimResult = { ok: true; sessionId: string } | { ok: false; status: InviteStatus };

export async function claimInvite(service: SupabaseClient, token: string, userId: string): Promise<ClaimResult> {
  const inv = await loadInvite(service, token);
  const status = inviteStatus(inv, userId);
  if (status === 'mine') return { ok: true, sessionId: inv!.session_id };
  if (status !== 'ok') return { ok: false, status };

  // First account wins: the update only lands while nobody has claimed it.
  const { data: won, error } = await service
    .from('media_invites')
    .update({ claimed_by: userId, claimed_at: new Date().toISOString() })
    .eq('id', inv!.id)
    .is('claimed_by', null)
    .gt('expires_at', new Date().toISOString())
    .select('id');
  if (error) throw error;
  if (!won?.length) return { ok: false, status: inviteStatus(await loadInvite(service, token), userId) };

  const { data: tagData } = await service.from('session_media_tags').select('id, media_id').eq('invite_id', inv!.id);
  const inviteTags = (tagData ?? []) as Array<{ id: string; media_id: string }>;
  if (inviteTags.length) {
    const { data: mine } = await service
      .from('session_media_tags')
      .select('media_id')
      .eq('user_id', userId)
      .in(
        'media_id',
        inviteTags.map((t) => t.media_id)
      );
    // Already tagged on a photo (as an attendee, or removed by their own
    // choice): keep their tag as it is and drop the invite's.
    const plan = planClaim(inviteTags, new Set(((mine ?? []) as Array<{ media_id: string }>).map((m) => m.media_id)));
    if (plan.drop.length) {
      const { error: dErr } = await service.from('session_media_tags').delete().in('id', plan.drop);
      if (dErr) throw dErr;
    }
    if (plan.move.length) {
      const { error: mErr } = await service
        .from('session_media_tags')
        .update({ user_id: userId, invite_id: null })
        .in('id', plan.move);
      if (mErr) throw mErr;
    }
  }
  return { ok: true, sessionId: inv!.session_id };
}
