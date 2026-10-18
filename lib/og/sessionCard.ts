import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isTribeStorageUrl } from '@/lib/coachLink';
import { logError } from '@/lib/logger';
import { cardWhen, publicSessionPlace, publicSessionTitle } from '@/lib/share/sessionPublic';
import { SITE_PHOTOS } from '@/lib/site/photos';
import { SPORT_GROUPS } from '@/lib/site/sportGroups';
import { translateSport } from '@/lib/sportTranslationData';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { cardResponse, type CardProps } from './card';
import { cropCardPhoto } from './cardCrop';
import { cardPhotoCrop } from './coachCard';

/**
 * T-JOIN1 Part B. A session's share card, the one WhatsApp shows for
 * tribelatam.com/session/<id>/ (and /s/<id>, which redirects there). The
 * T-SHARE1 renderer and its rules (Al, 2026-10-18):
 *
 *   headline  the title, or "<Deporte> con <Nombre>", over two lines
 *   sub       the session's day and time, its place (partner gym or barrio,
 *             never the street address; Medellín when there is neither), and
 *             "Reserva en Tribe"
 *   tag       the sport
 *   photo     the session's first photo when it is in Tribe storage, else the
 *             sport's card photo (public/og), else the sport group's site photo
 *
 * Only fixed facts of that session. No spots, no attendee count, nothing that
 * changes: WhatsApp keeps the first preview it fetches in every old message.
 */
export const SESSION_CARD_SELECT =
  'id, title, sport, date, start_time, status, location, location_lat, location_lng, photos, ' +
  'creator_name, partner_id, partner_status, description, end_time, price_cents, currency, is_paid';

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

/** The session as the public view has it, and its partner's name when that partner is approved and active. */
export async function loadSessionForCard(
  id: string
): Promise<{ row: SessionCardRow; partnerName: string | null } | null> {
  const service = getServiceRoleClient();
  const { data, error } = await service.from('sessions_public').select(SESSION_CARD_SELECT).eq('id', id).maybeSingle();
  if (error) logError(error, { action: 'og.loadSessionForCard', sessionId: id });
  const row = (data as SessionCardRow | null) ?? null;
  if (!row) return null;
  let partnerName: string | null = null;
  if (row.partner_id && row.partner_status === 'approved') {
    const { data: partner } = await service
      .from('featured_partners')
      .select('business_name, status')
      .eq('id', row.partner_id)
      .maybeSingle();
    if (partner?.status === 'active') partnerName = partner.business_name ?? null;
  }
  return { row, partnerName };
}

/** The card's six discipline photos (public/og, face-checked in T-SHARE1 Part A), by app sport. */
const SPORT_CARD_PHOTO: Record<string, string> = {
  Boxing: '/og/og_boxeo.jpg',
  'Muay Thai': '/og/og_mma.jpg',
  Kickboxing: '/og/og_mma.jpg',
  'Jiu-Jitsu': '/og/og_mma.jpg',
  CrossFit: '/og/og_crossfit.jpg',
  HYROX: '/og/og_hyrox.jpg',
  Yoga: '/og/og_yoga.jpg',
  Calisthenics: '/og/og_funcional.jpg',
  Weightlifting: '/og/og_funcional.jpg',
};

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
  return {
    line,
    headlinePx: sessionHeadlinePx(line),
    sub: [cardWhen(row.date, row.start_time, 'es'), place ?? 'Medellín', 'Reserva en Tribe'],
    tag: sport ?? 'Tribe',
    ...(photo ? { photo } : {}),
    lang: 'es',
  };
}

/** The sport group's site photo, cut to the card's 696 x 630 on the fly (no card crop exists for it). */
async function groupPhoto(sport: string | null): Promise<string | null> {
  const group = SPORT_GROUPS.find((g) => g.sports.some((s) => s === sport));
  if (!group?.img) return null;
  try {
    const file = await readFile(join(process.cwd(), 'public', SITE_PHOTOS[group.img].replace(/^\/+/, '')));
    const crop = await cropCardPhoto(file);
    return `data:image/jpeg;base64,${crop.toString('base64')}`;
  } catch (error) {
    logError(error, { action: 'og.sessionCard.groupPhoto', sport });
    return null;
  }
}

/** The card's photo, in the order in the header. */
export async function sessionCardPhoto(row: SessionCardRow): Promise<string | null> {
  const first = (row.photos ?? []).find(Boolean) ?? null;
  if (first && isTribeStorageUrl(first)) {
    const crop = await cardPhotoCrop(`session-${row.id}`, { choice: { url: first, box: null, rule: 'chosen' } });
    if (crop) return `data:image/jpeg;base64,${crop.toString('base64')}`;
  }
  const card = row.sport ? SPORT_CARD_PHOTO[row.sport] : undefined;
  if (card) return card;
  return groupPhoto(row.sport);
}

/** A fingerprint of everything the card shows, for its URL (?v=). */
export function sessionCardVersion(row: SessionCardRow, partnerName: string | null): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        row.title,
        row.sport,
        row.date,
        row.start_time,
        row.location,
        row.location_lat,
        row.location_lng,
        (row.photos ?? [])[0] ?? null,
        row.creator_name,
        partnerName,
      ])
    )
    .digest('hex')
    .slice(0, 10);
}

/** The card route's work. Null when there is no such public session. */
export async function sessionCardResponse(id: string): Promise<Response | null> {
  const loaded = await loadSessionForCard(id);
  if (!loaded) return null;
  const photo = await sessionCardPhoto(loaded.row);
  return cardResponse(sessionCardProps(loaded.row, loaded.partnerName, photo));
}
