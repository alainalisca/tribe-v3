/**
 * T-SITE1 Part B. "La semana": the rules that turn the next seven days of
 * sessions into the public board. Pure, so every rule is a unit test; the query
 * and the cache live in lib/site/week.ts.
 *
 * The rules (Al, 2026-10-16):
 * - Published only: active, public, not yet started (Bogotá time), today
 *   through seven days out.
 * - Never staff or test sessions: creators who are admins, test accounts,
 *   banned or deleted are left out. TODO(T-TRUST1): switch to users.is_staff
 *   when that column exists; it does not yet.
 * - One row per series per WEEK: every occurrence of a recurring series in the
 *   window collapses into one row that names its days ("Lun a vie · 06:00") and
 *   links to the next occurrence.
 * - At most eight rows, as many different coaches as possible: each coach's
 *   soonest row first, then second rows, and so on.
 * - Never a street address: the place is the partner gym when the session is
 *   hosted at a verified one, else the neighbourhood, else the city.
 */
import { seriesParentId } from '@/lib/dal/sessions';
import { ACTIVE_CITY } from '@/lib/city-config';
import { neighborhoodFromAddress } from '@/lib/sessionLocation';
import { translateSport } from '@/lib/sportTranslationData';
import type { WeekRow } from './weekTypes';

export const WEEK_BOARD_MAX = 8;
export const WEEK_BOARD_DAYS = 7;

/** The columns lib/site/week.ts selects. Nothing else is read, so nothing else can leak. */
export type BoardSessionRow = {
  id: string;
  sport: string | null;
  title: string | null;
  date: string;
  start_time: string | null;
  duration: number | null;
  location: string | null;
  max_participants: number | null;
  current_participants: number | null;
  is_paid: boolean | null;
  price_cents: number | null;
  currency: string | null;
  status: string | null;
  recurring_parent_id: string | null;
  partner_status: string | null;
  partner: { business_name: string | null; status: string | null } | null;
  creator: {
    id: string;
    name: string | null;
    avatar_url: string | null;
    is_admin: boolean | null;
    is_test_account: boolean | null;
    banned: boolean | null;
    deleted_at: string | null;
  } | null;
};

/** Staff, test, banned and deleted accounts never appear. TODO(T-TRUST1): users.is_staff. */
export function isListedCreator(
  creator: BoardSessionRow['creator']
): creator is NonNullable<BoardSessionRow['creator']> {
  return !!creator && !creator.is_admin && !creator.is_test_account && !creator.banned && !creator.deleted_at;
}

/** The public place: verified partner gym, else neighbourhood, else the city. Never `location` itself. */
export function publicPlace(row: Pick<BoardSessionRow, 'location' | 'partner_status' | 'partner'>): string {
  const partner =
    row.partner_status === 'approved' && row.partner?.status === 'active' ? row.partner.business_name?.trim() : null;
  return partner || neighborhoodFromAddress(row.location) || ACTIVE_CITY.name;
}

function words(name: string | null | undefined): string[] {
  return (name ?? '').trim().split(/\s+/).filter(Boolean);
}

export function firstName(name: string | null | undefined): string {
  return words(name)[0] ?? '';
}

/** "Andrés Varón" -> "Andrés V."; "Neera y" -> "Neera Y."; one word stays as is. */
export function shortName(name: string | null | undefined): string {
  const [first = '', second] = words(name);
  return second ? `${first} ${second[0].toLocaleUpperCase('es')}.` : first;
}

/** ISO weekday (1 = Monday ... 7 = Sunday) of a YYYY-MM-DD calendar date. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

const DAY_SHORT = {
  es: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
} as const;
const RANGE = { es: 'a', en: 'to' } as const;
const AND = { es: 'y', en: 'and' } as const;

/**
 * "Lun a vie", "Lun, mié y vie", "Sáb y dom", "Mar". Runs of three or more
 * consecutive days read as a range. Spanish lowercases every day after the
 * first; English keeps them capitalised.
 */
export function daysLabel(weekdays: readonly number[], lang: 'es' | 'en'): string {
  const days = [...new Set(weekdays)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  const runs: number[][] = [];
  for (const d of days) {
    const run = runs[runs.length - 1];
    if (run && d === run[run.length - 1] + 1) run.push(d);
    else runs.push([d]);
  }
  const name = (d: number, first: boolean) => {
    const n = DAY_SHORT[lang][d - 1];
    return first || lang === 'en' ? n : n.toLocaleLowerCase('es');
  };
  const parts: string[] = [];
  runs.forEach((run) => {
    const first = parts.length === 0;
    if (run.length >= 3) parts.push(`${name(run[0], first)} ${RANGE[lang]} ${name(run[run.length - 1], false)}`);
    else run.forEach((d, i) => parts.push(name(d, first && i === 0)));
  });
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} ${AND[lang]} ${parts[parts.length - 1]}`;
}

/** The row's title, never blank: its own title, else "<Sport> con <First name>". */
export function rowTitle(row: Pick<WeekRow, 'title' | 'sport' | 'creatorFirstName'>, lang: 'es' | 'en'): string {
  if (row.title?.trim()) return row.title.trim();
  const sport =
    row.sport === 'Other' || !row.sport ? (lang === 'en' ? 'Class' : 'Clase') : translateSport(row.sport, lang);
  return row.creatorFirstName ? `${sport} ${lang === 'en' ? 'with' : 'con'} ${row.creatorFirstName}` : sport;
}

function hhmm(time: string | null): string {
  return (time ?? '').slice(0, 5);
}

/** Occurrences still to come, in the window, from listed creators; soonest first. */
function upcoming(
  rows: readonly BoardSessionRow[],
  today: string,
  lastDay: string,
  nowTime: string
): BoardSessionRow[] {
  return rows
    .filter((r) => r.status === 'active' && r.date >= today && r.date <= lastDay)
    .filter((r) => !(r.date === today && hhmm(r.start_time) < nowTime))
    .filter((r) => isListedCreator(r.creator))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || hhmm(a.start_time).localeCompare(hhmm(b.start_time)));
}

/** One row per series: the next occurrence, plus every weekday the series meets this week. */
export function collapseSeries(sorted: readonly BoardSessionRow[]): WeekRow[] {
  const bySeries = new Map<string, { row: WeekRow; days: Set<number> }>();
  for (const s of sorted) {
    const key = seriesParentId(s);
    const seen = bySeries.get(key);
    if (seen) {
      seen.days.add(isoWeekday(s.date));
      continue;
    }
    const creator = s.creator as NonNullable<BoardSessionRow['creator']>;
    const max = s.max_participants ?? 0;
    const left = max - (s.current_participants ?? 0);
    const paid = !!s.is_paid && (s.price_cents ?? 0) > 0;
    bySeries.set(key, {
      days: new Set([isoWeekday(s.date)]),
      row: {
        id: s.id,
        seriesId: key,
        sport: s.sport ?? '',
        title: s.title?.trim() || null,
        date: s.date,
        startTime: hhmm(s.start_time),
        weekdays: [],
        duration: s.duration ?? 60,
        place: publicPlace(s),
        price: paid ? { cents: s.price_cents as number, currency: (s.currency || 'COP').toUpperCase() } : null,
        spotsLeft: max > 0 && left > 0 ? left : null,
        creatorId: creator.id,
        creatorFirstName: firstName(creator.name),
        creatorName: shortName(creator.name),
        creatorAvatarUrl: creator.avatar_url,
      },
    });
  }
  return [...bySeries.values()].map(({ row, days }) => ({
    ...row,
    weekdays: [...days].sort((a, b) => a - b),
  }));
}

/**
 * Up to `max` rows with as many different coaches as possible: every coach's
 * soonest row, then every coach's second, and so on; shown soonest first.
 */
export function pickVaried(rows: readonly WeekRow[], max = WEEK_BOARD_MAX): WeekRow[] {
  const byCoach = new Map<string, WeekRow[]>();
  for (const r of rows) byCoach.set(r.creatorId, [...(byCoach.get(r.creatorId) ?? []), r]);
  const picked: WeekRow[] = [];
  for (let round = 0; picked.length < max; round++) {
    const layer = [...byCoach.values()].map((list) => list[round]).filter((r): r is WeekRow => !!r);
    if (layer.length === 0) break;
    for (const r of layer) if (picked.length < max) picked.push(r);
  }
  const order = new Map(rows.map((r, i) => [r.id, i]));
  return picked.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** The board, from the raw query rows. `now` decides today and what has already started. */
export function buildWeekBoard(
  rows: readonly BoardSessionRow[],
  today: string,
  lastDay: string,
  nowTime: string
): WeekRow[] {
  return pickVaried(collapseSeries(upcoming(rows, today, lastDay, nowTime)));
}

/** The ticker's first two items: the two soonest rows, "Lun a vie 06:00" + "Boxeo con Salomón · El Poblado". */
export function tickerLead(rows: readonly WeekRow[], lang: 'es' | 'en'): { id: string; tag: string; text: string }[] {
  return rows.slice(0, 2).map((r) => ({
    id: `week-${r.id}`,
    tag: `${daysLabel(r.weekdays, lang)} ${r.startTime}`,
    text: `${rowTitle(r, lang)} · ${r.place}`,
  }));
}
