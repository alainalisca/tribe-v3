import { ACTIVE_CITY, detectNeighborhood } from '@/lib/city-config';
import { neighborhoodFromAddress } from '@/lib/sessionLocation';
import { translateSport } from '@/lib/sportTranslationData';

/**
 * T-JOIN1 Part B. What a session shows a signed-out visitor, worded once for
 * the share card, the share metadata and the signed-out session page, so the
 * three always agree. Pure and client-safe.
 */
export type PublicLang = 'es' | 'en';

/**
 * The title, or the fallback "<Deporte> con <Nombre>": the host's FIRST name
 * only (Al, 2026-10-18: "Boxeo con Salomón", "Yoga con Neera"), as stored,
 * accents and all. A trailing word that is the sport itself is dropped first
 * ("Neera yoga" teaches Yoga: "Yoga con Neera"). With no name, the sport
 * alone; with the sport "Other", "Sesión" / "Session".
 */
export function publicSessionTitle(
  s: { title?: string | null; sport?: string | null; creatorName?: string | null },
  lang: PublicLang
): string {
  const given = s.title?.trim();
  if (given) return given;
  const sportName =
    s.sport && s.sport !== 'Other' ? translateSport(s.sport, lang) : lang === 'en' ? 'Session' : 'Sesión';
  const first = hostFirstName(s.creatorName, s.sport);
  return first ? `${sportName} ${lang === 'en' ? 'with' : 'con'} ${first}` : sportName;
}

const fold = (w: string) =>
  w
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * True when a title only repeats the session's sport ("HYROX" for HYROX,
 * "boxeo" for Boxing), folded the same way as hostFirstName: case and accents
 * ignored, the sport's key, Spanish and English names all count. A card then
 * shows "<Deporte> con <Nombre>" instead of saying the sport twice.
 */
export function isSportOnlyTitle(title: string | null | undefined, sport: string | null | undefined): boolean {
  const given = title?.trim();
  if (!given || !sport || sport === 'Other') return false;
  const t = fold(given);
  return t === fold(sport) || t === fold(translateSport(sport, 'es')) || t === fold(translateSport(sport, 'en'));
}

/** The host's first name as stored, after dropping trailing words that are the sport (in English or Spanish). */
export function hostFirstName(name: string | null | undefined, sport?: string | null): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (sport && sport !== 'Other') {
    const sportWords = new Set([fold(sport), fold(translateSport(sport, 'es')), fold(translateSport(sport, 'en'))]);
    while (words.length > 1 && sportWords.has(fold(words[words.length - 1]))) words.pop();
  }
  return words[0] ?? '';
}

/**
 * Where, for someone not signed in: the approved partner gym's name, and the
 * barrio. NEVER the street address (the session's `location` is free text and
 * usually is one): the barrio comes from the coordinates, or failing them from
 * the address with the street dropped. Nothing when it would only be the city.
 */
export function publicSessionPlace(s: {
  partnerName?: string | null;
  partnerApproved?: boolean;
  lat?: number | null;
  lng?: number | null;
  location?: string | null;
}): { place: string | null; barrio: string | null } {
  const fromCoords = s.lat != null && s.lng != null ? (detectNeighborhood(s.lat, s.lng)?.name ?? null) : null;
  const hood = fromCoords ?? neighborhoodFromAddress(s.location);
  const barrio = hood && hood !== ACTIVE_CITY.name ? hood : null;
  const partner = s.partnerApproved ? (s.partnerName?.trim() ?? null) : null;
  if (partner) return { place: partner, barrio };
  return { place: barrio, barrio: null };
}

const DAYS = {
  es: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
const DAYS_LONG = {
  es: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};
const MONTHS = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
const MONTHS_LONG = {
  es: [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ],
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
};

/** The calendar date's parts, read as a date (never shifted by a time zone). */
function parts(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return { weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay(), month: m - 1, day: d };
}
const hhmm = (time: string | null | undefined) => (time ?? '').slice(0, 5);

/** The card's line: "Lun 20 oct · 06:00" / "Mon Oct 20 · 06:00". A fixed fact of that session. */
export function cardWhen(date: string, time: string | null | undefined, lang: PublicLang): string {
  const p = parts(date);
  const day =
    lang === 'en'
      ? `${DAYS.en[p.weekday]} ${MONTHS.en[p.month]} ${p.day}`
      : `${DAYS.es[p.weekday]} ${p.day} ${MONTHS.es[p.month]}`;
  return hhmm(time) ? `${day} · ${hhmm(time)}` : day;
}

/** The page's "Cuándo": "Lunes 20 de octubre, 06:00" / "Monday, October 20, 06:00". */
export function pageWhen(date: string, time: string | null | undefined, lang: PublicLang): string {
  const p = parts(date);
  const day =
    lang === 'en'
      ? `${DAYS_LONG.en[p.weekday]}, ${MONTHS_LONG.en[p.month]} ${p.day}`
      : `${DAYS_LONG.es[p.weekday][0].toUpperCase()}${DAYS_LONG.es[p.weekday].slice(1)} ${p.day} de ${MONTHS_LONG.es[p.month]}`;
  return hhmm(time) ? `${day}, ${hhmm(time)}` : day;
}
