import { createHash } from 'node:crypto';
import { logError } from '@/lib/logger';
import { cardPriceLabel } from '@/lib/share/cardCopy';
import { cardWhen, hostFirstName, publicSessionPlace, publicSessionTitle } from '@/lib/share/sessionPublic';
import { translateSport } from '@/lib/sportTranslationData';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { cardResponse, type CardProps } from './card';
import { cardPhotoCrop, chooseCardPhoto, loadCoach, type CoachRow } from './coachCard';
import { siteCardImage } from './siteCards';

/**
 * T-JOIN1. A session's share card, the one WhatsApp shows for
 * tribelatam.com/session/<id>/ (and /s/<id>, which redirects there). The
 * T-SHARE1 renderer and its rules (Al, 2026-10-18):
 *
 *   headline  the title, or "<Deporte> con <Nombre>" with the host's first
 *             name only, over two lines
 *   sub       the session's day and time, its place (partner gym or barrio,
 *             never the street address; Medellín when there is neither), and
 *             "Reserva en Tribe"
 *   tag       the sport
 *   photo     the HOST's coach-card photo, by the coach card's own chain
 *             (card_photo_url, then gallery or cover, then a sharp avatar;
 *             lib/og/coachCard.ts), else the no-photo card with the host's
 *             initial. Never the session's own images: those are flyers and
 *             venue shots.
 *
 * Only fixed facts of that session. No spots, no attendee count, nothing that
 * changes: WhatsApp keeps the first preview it fetches in every old message.
 * And always an image: a session that cannot be drawn gets the no-photo
 * card, and one that is not public gets the site's home card.
 */
export const SESSION_CARD_SELECT =
  'id, title, sport, date, start_time, status, location, location_lat, location_lng, photos, ' +
  'creator_id, creator_name, partner_id, partner_status, description, end_time, price_cents, currency, is_paid';

export type SessionCardRow = {
  id: string;
  title: string | null;
  sport: string | null;
  date: string;
  start_time: string | null;
  status: string | null;
  location: string | null;
  location_lat: number | null;
  location_lng: number | null;
  photos: string[] | null;
  creator_id?: string | null;
  creator_name: string | null;
  partner_id: string | null;
  partner_status: string | null;
  /** Not on the card; the session page's metadata reads them from the same row. */
  description?: string | null;
  end_time?: string | null;
  price_cents?: number | null;
  currency?: string | null;
  is_paid?: boolean | null;
};

export type LoadedSession = { row: SessionCardRow; partnerName: string | null; host: CoachRow | null };

/** The session as the public view has it, its partner's name when approved and active, and its host. */
export async function loadSessionForCard(id: string): Promise<LoadedSession | null> {
  const service = getServiceRoleClient();
  const { data, error } = await service.from('sessions_public').select(SESSION_CARD_SELECT).eq('id', id).maybeSingle();
  if (error) logError(error, { action: 'og.loadSessionForCard', sessionId: id });
  const row = (data as SessionCardRow | null) ?? null;
  if (!row) return null;
  const [partnerName, host] = await Promise.all([
    (async () => {
      if (!row.partner_id || row.partner_status !== 'approved') return null;
      const { data: partner } = await service
        .from('featured_partners')
        .select('business_name, status')
        .eq('id', row.partner_id)
        .maybeSingle();
      return partner?.status === 'active' ? (partner.business_name ?? null) : null;
    })(),
    row.creator_id ? loadCoach(row.creator_id).catch(() => null) : Promise.resolve(null),
  ]);
  return { row, partnerName, host };
}

/**
 * og:description (Al, 2026-10-18): "<Día DD mes> · <HH:MM> · <barrio> ·
 * <precio o Gratis> · Reserva en Tribe", the same order free or paid, and
 * never the title again. The barrio, else the partner gym, else Medellín.
 */
export function sessionShareDescription(row: SessionCardRow, partnerName: string | null): string {
  const { place, barrio } = publicSessionPlace({
    partnerName,
    partnerApproved: !!partnerName,
    lat: row.location_lat,
    lng: row.location_lng,
    location: row.location,
  });
  return [
    cardWhen(row.date, row.start_time, 'es'),
    barrio ?? place ?? 'Medellín',
    cardPriceLabel(row.is_paid === false ? 0 : row.price_cents, row.currency),
    'Reserva en Tribe',
  ].join(' · ');
}

/** Longest a headline line may be before it is cut, at the card's long size (88 px). */
const LINE_MAX = 16;
const clip = (s: string) => (s.length > LINE_MAX ? `${s.slice(0, LINE_MAX - 1).trimEnd()}…` : s);

/**
 * A title over the card's two lines. "Boxeo con Salomon Tabares" splits after
 * "con"; any other title splits where the two lines come out most even. A line
 * too long for the card is cut with an ellipsis rather than wrapping into the
 * sub lines.
 */
export function splitHeadline(title: string): [string, string] {
  const t = title.trim().replace(/\s+/g, ' ');
  const linker = / (con|with) /i.exec(t);
  if (linker && linker.index > 0) {
    const cut = linker.index + linker[0].length - 1;
    return [clip(t.slice(0, cut)), clip(t.slice(cut + 1))];
  }
  const words = t.split(' ');
  if (words.length === 1) return ['', clip(t)];
  let best = 1;
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const score = Math.max(words.slice(0, i).join(' ').length, words.slice(i).join(' ').length);
    if (score < bestScore) [best, bestScore] = [i, score];
  }
  return [clip(words.slice(0, best).join(' ')), clip(words.slice(best).join(' '))];
}

/**
 * The headline size that keeps both lines, and line 2's lime dot, off the
 * photo. The text runs from x 66; the photo starts at x 504; a 24 px gutter
 * leaves 414 px. Big Shoulders 900 capitals measured 0.45 to 0.46 em each on
 * the rendered cards ("BOXEO CON", "SALOMON TABARES" at 88 px); 0.47 keeps a
 * margin. The dot is 22 px (16 and its 6 px gap). Never above the site
 * cards' 101 px.
 */
export const HEADLINE_ROOM = 414;
const EM_PER_CHAR = 0.47;
const DOT_PX = 22;
export function sessionHeadlinePx([first, second]: [string, string]): number {
  const fitFirst = first ? HEADLINE_ROOM / (EM_PER_CHAR * first.length) : Infinity;
  const fitSecond = (HEADLINE_ROOM - DOT_PX) / (EM_PER_CHAR * Math.max(1, second.length));
  return Math.min(101, Math.floor(Math.min(fitFirst, fitSecond)));
}

export function sessionCardProps(row: SessionCardRow, partnerName: string | null, photo: string | null): CardProps {
  const title = publicSessionTitle({ title: row.title, sport: row.sport, creatorName: row.creator_name }, 'es');
  const { place } = publicSessionPlace({
    partnerName,
    partnerApproved: !!partnerName,
    lat: row.location_lat,
    lng: row.location_lng,
    location: row.location,
  });
  const sport = row.sport && row.sport !== 'Other' ? translateSport(row.sport, 'es') : null;
  const line = splitHeadline(title);
  const initial = Array.from(hostFirstName(row.creator_name, row.sport) || 'Tribe')[0];
  return {
    line,
    headlinePx: sessionHeadlinePx(line),
    sub: [cardWhen(row.date, row.start_time, 'es'), place ?? 'Medellín', 'Reserva en Tribe'],
    tag: sport ?? 'Tribe',
    ...(photo ? { photo } : { initial }),
    lang: 'es',
  };
}

/** The host's coach-card photo (the coach card's chain and its stored crop), or null for the no-photo card. */
export async function sessionCardPhoto(host: CoachRow | null): Promise<string | null> {
  if (!host) return null;
  try {
    const picked = await chooseCardPhoto(host);
    const crop = picked ? await cardPhotoCrop(host.id, picked) : null;
    return crop ? `data:image/jpeg;base64,${crop.toString('base64')}` : null;
  } catch (error) {
    logError(error, { action: 'og.sessionCardPhoto', hostId: host.id });
    return null;
  }
}

/** A fingerprint of everything the card shows, for its URL (?v=). */
export function sessionCardVersion(
  row: SessionCardRow,
  partnerName: string | null,
  host: CoachRow | null = null
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        'v2-host-photo',
        row.title,
        row.sport,
        row.date,
        row.start_time,
        row.location,
        row.location_lat,
        row.location_lng,
        row.creator_name,
        partnerName,
        host?.card_photo_url ?? null,
        host?.card_photo_box ?? null,
        host?.card_photo_rejects ?? null,
        host?.cover_image_url ?? null,
        host?.photos ?? null,
        host?.avatar_url ?? null,
      ])
    )
    .digest('hex')
    .slice(0, 10);
}

/**
 * The card route's work. Always an image: the host's photo card; if drawing it
 * fails, the no-photo card; a session that is not public, the site's home card.
 */
export async function sessionCardResponse(id: string): Promise<{ res: Response; fallback: boolean }> {
  const loaded = await loadSessionForCard(id).catch((error) => {
    logError(error, { action: 'og.sessionCardResponse.load', sessionId: id });
    return null;
  });
  if (!loaded) return { res: await siteCardImage('home', 'es'), fallback: true };
  const photo = await sessionCardPhoto(loaded.host);
  try {
    return { res: await cardResponse(sessionCardProps(loaded.row, loaded.partnerName, photo)), fallback: false };
  } catch (error) {
    logError(error, { action: 'og.sessionCardResponse.render', sessionId: id });
    return { res: await cardResponse(sessionCardProps(loaded.row, loaded.partnerName, null)), fallback: false };
  }
}
