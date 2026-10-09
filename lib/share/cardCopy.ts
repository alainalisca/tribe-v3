/**
 * Spanish copy for SHARE CARDS — the link preview a stranger sees in WhatsApp,
 * iMessage or an Instagram DM, plus the og:title/og:description beside it.
 *
 * WHY THIS IS NOT lib/share.ts. That module builds the MESSAGE BODY a logged-in
 * user sends ("HYROX con Leo Garcia / en Ciudad del Río / lun, 12 oct"), it is
 * bilingual because it has a LanguageContext to read, and it uses SHORT date
 * forms because it is one line inside a longer paragraph. A card has no reader
 * to ask for a language (a scraper sends no session and no Accept-Language we
 * act on), is Spanish-only by that reasoning, and uses LONG forms because the
 * date is a display line in its own right. Same subject, different surface,
 * different strings — so they are two modules rather than one with a mode flag.
 *
 * WHY THE MONTH AND WEEKDAY NAMES ARE HARDCODED RATHER THAN Intl. The OG route
 * runs on the EDGE runtime, where ICU locale data is not guaranteed to be
 * complete: `toLocaleDateString('es-CO', { weekday: 'long' })` can silently
 * return an English weekday, and a card is exactly the surface where nobody
 * would notice for months. Nineteen hardcoded strings cannot do that. It also
 * sidesteps the trailing-comma and lowercase-weekday shapes CLDR produces
 * ("lunes, 12 de octubre"), which would need post-processing anyway.
 *
 * WHY THE PRICE IS GROUPED BY HAND. `(cents / 100).toLocaleString()` with no
 * locale reads the RUNTIME's locale. In the browser that is the user's, so
 * lib/share.ts is right to use it; on a server it is en-US, so the same call
 * renders a Colombian price as "50,000" — wrong separator for the market this
 * app launched in, and a defect no test would catch because tests mock nothing
 * about locale. The card formats explicitly.
 */

/** Spanish month names, index 0 = January. */
const MONTHS_ES = [
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
] as const;

/** Spanish weekday names, index 0 = Sunday, matching Date#getUTCDay. */
const WEEKDAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;

/** Three-letter weekday/month forms for the compact og:description line. */
const WEEKDAYS_ES_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;
const MONTHS_ES_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;

/** `YYYY-MM-DD` → {y, m, d} with m 1-based, or null if it is not that shape. */
function parseYmd(date: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!date) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

/**
 * Weekday index for a calendar date, computed in UTC.
 *
 * `new Date('2026-10-12')` is parsed as UTC midnight but `getDay()` reads it in
 * the SERVER's zone, so west of UTC it reports the previous day — the card
 * would say "Domingo 12 de octubre" for a Monday. Date.UTC + getUTCDay keeps
 * both ends in the same frame, which is the only thing that makes the answer a
 * property of the date rather than of where the render happened to run.
 */
function utcWeekday(y: number, m: number, d: number): number {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Long Spanish date for the card's own display line: "Lunes 12 de octubre".
 * Returns '' when the date is missing or unparseable, so a caller can drop the
 * line rather than print a placeholder.
 */
export function cardDateLabel(date: string | null | undefined): string {
  const ymd = parseYmd(date);
  if (!ymd) return '';
  const weekday = WEEKDAYS_ES[utcWeekday(ymd.y, ymd.m, ymd.d)];
  return `${weekday} ${ymd.d} de ${MONTHS_ES[ymd.m - 1]}`;
}

/** Compact Spanish date for og:description: "lun 12 oct". */
export function cardDateLabelShort(date: string | null | undefined): string {
  const ymd = parseYmd(date);
  if (!ymd) return '';
  const weekday = WEEKDAYS_ES_SHORT[utcWeekday(ymd.y, ymd.m, ymd.d)];
  return `${weekday} ${ymd.d} ${MONTHS_ES_SHORT[ymd.m - 1]}`;
}

/**
 * `HH:MM[:SS]` → "9:00 a.m." / "6:30 p.m.".
 *
 * Written out rather than taken from Intl for the ICU reason in the header, and
 * because es-CO's CLDR form is "9:00 a. m." — with a space inside the
 * abbreviation — which is correct Spanish typography and looks like a bug in a
 * share card. Returns '' on anything unparseable.
 */
export function cardTimeLabel(time: string | null | undefined): string {
  if (!time) return '';
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return '';
  const h24 = Number(match[1]);
  const minutes = match[2];
  if (h24 < 0 || h24 > 23) return '';
  const suffix = h24 < 12 ? 'a.m.' : 'p.m.';
  // 0 -> 12 a.m., 12 -> 12 p.m., 13 -> 1 p.m.
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${minutes} ${suffix}`;
}

/** "Lunes 12 de octubre · 9:00 a.m.", dropping either half if absent. */
export function cardDateTimeLabel(date: string | null | undefined, time: string | null | undefined): string {
  return [cardDateLabel(date), cardTimeLabel(time)].filter(Boolean).join(' · ');
}

/**
 * Colombian price for a card: "$50.000 COP", or "Gratis" when there is no
 * charge.
 *
 * COP has no centavos in practice, so the amount is rounded to whole pesos and
 * grouped with '.' per Colombian convention. Any other currency keeps two
 * decimals and ',' grouping, which is the English-speaking convention the only
 * other supported currency (USD) uses.
 */
export function cardPriceLabel(priceCents: number | null | undefined, currency?: string | null): string {
  if (!priceCents || priceCents <= 0) return 'Gratis';
  const code = (currency || 'COP').toUpperCase();
  if (code === 'COP') {
    const pesos = Math.round(priceCents / 100);
    return `$${groupDigits(String(pesos), '.')} COP`;
  }
  const whole = Math.floor(priceCents / 100);
  const cents = String(priceCents % 100).padStart(2, '0');
  return `$${groupDigits(String(whole), ',')}.${cents} ${code}`;
}

/** Insert `sep` every three digits from the right. */
function groupDigits(digits: string, sep: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/**
 * The availability pill: "20 cupos disponibles".
 *
 * Returns '' when the session has no capacity set, because "0 cupos" on an
 * uncapped session reads as "full" — the opposite of the truth — and a missing
 * pill is the honest rendering of "we do not publish a number for this one".
 * Singular is spelled out; Spanish does not pluralise by appending to a count.
 */
export function cardSpotsLabel(
  maxParticipants: number | null | undefined,
  currentParticipants: number | null | undefined
): string {
  if (!maxParticipants || maxParticipants <= 0) return '';
  const taken = Math.max(0, currentParticipants ?? 0);
  const left = maxParticipants - taken;
  if (left <= 0) return 'Cupos agotados';
  return left === 1 ? '1 cupo disponible' : `${left} cupos disponibles`;
}

/** True when the pill should read as "full" rather than as availability. */
export function cardSpotsIsFull(label: string): boolean {
  return label === 'Cupos agotados';
}

export interface SessionCardCopyInput {
  title?: string | null;
  sport?: string | null;
  date?: string | null;
  startTime?: string | null;
  priceCents?: number | null;
  currency?: string | null;
  instructorName?: string | null;
  venue?: string | null;
  neighborhood?: string | null;
}

/**
 * The HEADLINE: the session's own title when it has one, otherwise the sport.
 *
 * This is the single place that decision is made, and it is the fix for the
 * "HYROX HYROX" duplication: /s/[id] used to pass `title` AND `sport` as
 * separate card params, and the card drew both, so a session whose title IS its
 * sport printed the word twice. Callers now resolve one headline here and the
 * card has no second string to draw.
 */
export function cardHeadline(input: Pick<SessionCardCopyInput, 'title' | 'sport'>): string {
  const title = (input.title ?? '').trim();
  if (title) return title;
  // `sport` is the enum spelling ('martial_arts'); underscores are a storage
  // detail and must never reach a card.
  return (input.sport ?? '').replace(/_/g, ' ').trim();
}

/**
 * The card's location line: the VENUE the host typed, or the detected
 * neighborhood when there is no venue.
 *
 * ONE of the two, never both, and that is the fix for a real redundancy. The
 * live HYROX session's `location` is "CrossFit BullBox Ciudad del Río" and its
 * detected neighborhood is "El Poblado" — Ciudad del Río is IN El Poblado, so
 * joining them printed three location tokens for one place. A dedup on exact
 * string equality cannot catch that; the strings differ, the places do not.
 *
 * Venue wins because it is what a human chose to write, and the neighborhood
 * is a guess derived from coordinates. Where there is no venue the guess is
 * strictly better than nothing — which is the /invite route's case, where the
 * street address is deliberately withheld and the neighborhood is all the card
 * is allowed to know.
 */
export function cardVenueLabel(venue?: string | null, neighborhood?: string | null): string {
  const v = (venue ?? '').trim();
  if (v) return v;
  return (neighborhood ?? '').trim();
}

/**
 * The og:description for a session: the compact one-line summary that sits
 * under the card in a chat preview.
 *
 * Example: "HYROX con Leo Garcia · CrossFit BullBox · lun 12 oct · $50.000 COP"
 *
 * Deliberately NOT the same string as the card's display lines — this one has
 * to survive being truncated at ~160 characters by every platform, so it leads
 * with what identifies the session and puts the price last.
 */
export function sessionCardDescription(input: SessionCardCopyInput): string {
  const headline = cardHeadline(input);
  const instructor = (input.instructorName ?? '').trim();
  const lead = headline && instructor ? `${headline} con ${instructor}` : headline || instructor;
  const parts = [
    lead,
    cardVenueLabel(input.venue, input.neighborhood),
    cardDateLabelShort(input.date),
    cardPriceLabel(input.priceCents, input.currency),
  ].filter(Boolean);
  return parts.join(' · ').slice(0, 160);
}

/** The og:title for a session: "HYROX con Leo Garcia | Tribe". */
export function sessionCardTitle(input: Pick<SessionCardCopyInput, 'title' | 'sport' | 'instructorName'>): string {
  const headline = cardHeadline(input) || 'Entrenamiento';
  const instructor = (input.instructorName ?? '').trim();
  return instructor ? `${headline} con ${instructor}` : headline;
}
