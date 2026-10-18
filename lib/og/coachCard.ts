import { createHash } from 'node:crypto';
import { isTribeStorageUrl, isUserId, normalizeHandle } from '@/lib/coachLink';
import { logError } from '@/lib/logger';
import { translateSport } from '@/lib/sportTranslationData';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { cardResponse, type CardProps } from './card';
import { cropCardPhoto, isCardBox, orientedSize, type CardBox } from './cardCrop';

/**
 * T-SHARE1 Part C. A coach's own share card, the one WhatsApp shows for
 * tribelatam.com/i/<handle>: "Entrena con" and their first name, their sport,
 * their gym (or Medellín), "Reserva en Tribe", and their best training photo.
 * Approved mock: https://claude.ai/artifact/KzKuUqzPFg1NAZBVPU15J9.
 *
 * NOTHING THAT CHANGES WEEK TO WEEK goes on it (Al, 2026-10-17): WhatsApp keeps
 * the first preview it fetches for a URL in every old message, so a class count
 * or a date would go stale. Live numbers belong on the page.
 *
 * THE PHOTO, in order (spec Part C):
 *   a. card_photo_url, the one the coach or an admin picked, cut by card_photo_box;
 *   b. otherwise the best of cover_image_url and photos[]: at least 900 px on its
 *      short side, landscape first, then the largest;
 *   c. otherwise avatar_url, only if at least 800 px on its short side;
 *   d. otherwise no photo: the charcoal card with a grid and their initial.
 * Only Tribe storage URLs, never a hotlink (no Unsplash, no other site), and
 * never an image in card_photo_rejects (stock photos, flyers, logos), at any
 * step, including (a).
 *
 * THE CROP is cut once and kept in storage, profile-images/card-photos/
 * <user>-<hash>.jpg, the hash taken over the source URL and the box: a new pick
 * or a moved box is a new file, so nothing stale is ever served.
 *
 * Server only (service role: card_photo_rejects is readable by no client).
 */

export const COACH_SELECT =
  'id, name, sports, avatar_url, cover_image_url, photos, card_photo_url, card_photo_box, ' +
  'card_photo_rejects, handle, is_instructor, banned, deleted_at, is_test_account, bio, instructor_bio, specialties';

export type CoachRow = {
  id: string;
  name: string | null;
  sports: string[] | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  photos: string[] | null;
  card_photo_url: string | null;
  card_photo_box: unknown;
  card_photo_rejects: string[] | null;
  handle: string | null;
  is_instructor: boolean | null;
  banned: boolean | null;
  deleted_at: string | null;
  is_test_account: boolean | null;
  bio: string | null;
  instructor_bio: string | null;
  /** Shown on the coach page (Part E), never on the card. */
  specialties?: string[] | null;
};

export type PhotoRule = 'chosen' | 'gallery' | 'avatar';
export type PhotoChoice = { url: string; box: CardBox | null; rule: PhotoRule };

export const GALLERY_MIN_SHORT = 900;
export const AVATAR_MIN_SHORT = 800;
const CARD_PHOTO_BUCKET = 'profile-images';
const FETCH_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** A coach the card is drawn for: an instructor, not banned, deleted or a test account. */
export function isListedCoach(c: CoachRow): boolean {
  return !!c.is_instructor && !c.banned && !c.deleted_at && !c.is_test_account;
}

/** /i/<x>: the account id when it looks like one, the handle otherwise. */
export async function loadCoach(idOrHandle: string): Promise<CoachRow | null> {
  const byId = isUserId(idOrHandle);
  const { data, error } = await getServiceRoleClient()
    .from('users')
    .select(COACH_SELECT)
    .eq(byId ? 'id' : 'handle', byId ? idOrHandle : normalizeHandle(idOrHandle))
    .maybeSingle();
  if (error) logError(error, { action: 'og.loadCoach' });
  return (data as CoachRow | null) ?? null;
}

export type FetchImage = (url: string) => Promise<Buffer | null>;

/** The image's bytes, or null on any failure, a non-image, or more than 20 MB. */
export const fetchImage: FetchImage = async (url) => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > MAX_IMAGE_BYTES ? null : buf;
  } catch (error) {
    logError(error, { action: 'og.fetchImage' });
    return null;
  }
};

/**
 * Which photo the card shows, by the order in the header, and its bytes when
 * choosing needed them. (a) needs no download to choose; (b) and (c) are
 * measured, so their bytes come back with the choice.
 */
export async function chooseCardPhoto(
  coach: CoachRow,
  load: FetchImage = fetchImage
): Promise<{ choice: PhotoChoice; image?: Buffer } | null> {
  const rejects = new Set(coach.card_photo_rejects ?? []);
  const usable = (url: string | null | undefined): url is string => isTribeStorageUrl(url) && !rejects.has(url!);

  if (usable(coach.card_photo_url)) {
    const box = isCardBox(coach.card_photo_box) ? coach.card_photo_box : null;
    return { choice: { url: coach.card_photo_url, box, rule: 'chosen' } };
  }

  const gallery = [...new Set([coach.cover_image_url, ...(coach.photos ?? [])].filter(usable))];
  const measured = await Promise.all(
    gallery.map(async (url) => {
      const image = await load(url);
      if (!image) return null;
      const { width, height } = await orientedSize(image).catch(() => ({ width: 0, height: 0 }));
      return { url, image, width, height };
    })
  );
  const best = measured
    .filter((m): m is NonNullable<typeof m> => !!m && Math.min(m.width, m.height) >= GALLERY_MIN_SHORT)
    .sort(
      (a, b) => Number(b.width >= b.height) - Number(a.width >= a.height) || b.width * b.height - a.width * a.height
    )[0];
  if (best) return { choice: { url: best.url, box: null, rule: 'gallery' }, image: best.image };

  if (usable(coach.avatar_url)) {
    const image = await load(coach.avatar_url);
    if (image) {
      const { width, height } = await orientedSize(image).catch(() => ({ width: 0, height: 0 }));
      if (Math.min(width, height) >= AVATAR_MIN_SHORT) {
        return { choice: { url: coach.avatar_url, box: null, rule: 'avatar' }, image };
      }
    }
  }
  return null;
}

/** Where a crop is kept: one file per owner (a coach's id, or "session-<id>"), source and box. */
export function cardPhotoPath(key: string, choice: PhotoChoice): string {
  const hash = createHash('sha256')
    .update(`${choice.url}\n${JSON.stringify(choice.box)}`)
    .digest('hex')
    .slice(0, 16);
  return `card-photos/${key}-${hash}.jpg`;
}

/** The 696 x 630 crop: from storage when it was cut before, else cut now and kept. */
export async function cardPhotoCrop(
  key: string,
  picked: { choice: PhotoChoice; image?: Buffer },
  load: FetchImage = fetchImage
): Promise<Buffer | null> {
  const bucket = getServiceRoleClient().storage.from(CARD_PHOTO_BUCKET);
  const path = cardPhotoPath(key, picked.choice);
  const cached = await bucket.download(path);
  if (cached.data) return Buffer.from(await cached.data.arrayBuffer());

  const image = picked.image ?? (await load(picked.choice.url));
  if (!image) return null;
  const crop = await cropCardPhoto(image, picked.choice.box);
  const { error } = await bucket.upload(path, crop, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
    upsert: true,
  });
  // Not fatal: the card is drawn from the crop in hand and the next draw cuts again.
  if (error) logError(error, { action: 'og.cardPhotoCrop.upload', path });
  return crop;
}

/**
 * The gym on the card: the approved, active partner gym most of the coach's
 * sessions are at (last 60 days and upcoming), the same rule as the site's
 * roster. Null means "Medellín". Never users.location (Al, T-SITE1.1).
 */
export async function coachGym(userId: string, today = new Date()): Promise<string | null> {
  const since = new Date(today.getTime() - 60 * 864e5).toISOString().slice(0, 10);
  const { data, error } = await getServiceRoleClient()
    .from('sessions')
    .select('partner_status, partner:featured_partners(business_name, status)')
    .eq('creator_id', userId)
    .eq('status', 'active')
    .gte('date', since)
    .limit(500);
  if (error) {
    logError(error, { action: 'og.coachGym' });
    return null;
  }
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as unknown as {
    partner_status: string | null;
    partner: { business_name: string | null; status: string | null } | null;
  }[]) {
    const name = row.partner?.business_name?.trim();
    if (row.partner_status === 'approved' && row.partner?.status === 'active' && name) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** First name as the coach wrote it (Al, T-SITE1.1: names stay as written). */
export function coachFirstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] || 'Tribe';
}

/** The sport line's room: past this, two sports run into the photo ("CROSSFIT · LEVANTAMIENTO DE PESAS"). */
export const SPORT_LINE_MAX = 24;

/**
 * Up to two sports, in Spanish on the card (scrapers send no language; the
 * market is Colombia) and in the visitor's language on the page. The second
 * only when both fit the line. "Other" is not a sport to show.
 */
export function coachSports(sports: string[] | null | undefined, lang: 'es' | 'en' = 'es'): string[] {
  const names = (sports ?? []).filter((s) => s && s !== 'Other').map((s) => translateSport(s, lang));
  if (names.length < 2) return names;
  return `${names[0]} · ${names[1]}`.length <= SPORT_LINE_MAX ? names.slice(0, 2) : names.slice(0, 1);
}

/** The card: the mock's text, and the photo or the initial. */
export function coachCardProps(coach: CoachRow, gym: string | null, photo: string | null): CardProps {
  const first = coachFirstName(coach.name);
  const sports = coachSports(coach.sports);
  return {
    line: ['Entrena con', first],
    sub: [sports.join(' · ') || 'Entrenador', gym || 'Medellín', 'Reserva en Tribe'],
    tag: sports[0] ?? 'Coach',
    variant: 'coach',
    ...(photo ? { photo } : { initial: first.slice(0, 1) }),
    lang: 'es',
  };
}

/**
 * A short fingerprint of everything the card shows, for its URL (?v=): a new
 * name, sport, pick or gallery is a new URL, so a newly shared link gets the
 * new card while WhatsApp keeps the old one in old messages.
 */
export function coachCardVersion(coach: CoachRow, gym: string | null): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        coach.name,
        coach.sports,
        coach.avatar_url,
        coach.cover_image_url,
        coach.photos,
        coach.card_photo_url,
        coach.card_photo_box,
        coach.card_photo_rejects,
        gym,
      ])
    )
    .digest('hex')
    .slice(0, 10);
}

/** The card route's work: the coach, their gym and photo, the JPEG. Null when there is no listed coach. */
export async function coachCardResponse(idOrHandle: string): Promise<Response | null> {
  const coach = await loadCoach(idOrHandle);
  if (!coach || !isListedCoach(coach)) return null;
  const [gym, picked] = await Promise.all([coachGym(coach.id), chooseCardPhoto(coach)]);
  const crop = picked ? await cardPhotoCrop(coach.id, picked) : null;
  const photo = crop ? `data:image/jpeg;base64,${crop.toString('base64')}` : null;
  return cardResponse(coachCardProps(coach, gym, photo));
}
