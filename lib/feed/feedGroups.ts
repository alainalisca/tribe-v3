/**
 * T-UI-FD1: the signed-in home feed, regrouped.
 *
 *   1. Only bookable sessions: never a test session (is_test), a cancelled one
 *      (status other than 'active') or one that has already ended. The query
 *      (fetchUpcomingSessions) filters the first two already; this is the
 *      second line, and the only place "ended" is decided (date + start time
 *      + duration, the device's clock, as the rest of the feed).
 *   2. A recurring series shows once: its next occurrence, carrying the days
 *      of the week it runs on ("lun · mié · vie"), counted over the
 *      occurrences in the feed. Tapping the card opens that next occurrence.
 *   3. Grouped under day headers: Hoy, Mañana, then the weekday name for the
 *      rest of the coming week (the next six days, so a Sunday still shows
 *      "Martes" rather than lumping everything into "Más adelante"), then
 *      "Más adelante".
 *
 * Pure: the caller passes the clock.
 */

export type FeedSessionLike = {
  id: string;
  date: string;
  start_time: string | null;
  duration?: number | null;
  status?: string | null;
  is_test?: boolean | null;
  is_recurring?: boolean | null;
  recurring_parent_id?: string | null;
};

export type FeedItem<S> = {
  session: S;
  /** Set when the card stands for a recurring series: the weekdays it runs on, Monday first (0 = Monday). */
  seriesDays: number[] | null;
};

export type FeedGroupKey = 'today' | 'tomorrow' | 'weekday' | 'later';

export type FeedGroup<S> = {
  key: FeedGroupKey;
  /** YYYY-MM-DD of the day, or null for "Más adelante". */
  date: string | null;
  items: FeedItem<S>[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOf(ymd: string): Date {
  return new Date(`${ymd}T00:00:00`);
}

/** When a session ends: date + start time + duration (60 min when unknown); end of day without a time. */
export function sessionEndsAt(s: Pick<FeedSessionLike, 'date' | 'start_time' | 'duration'>): Date {
  if (!s.start_time) return new Date(`${s.date}T23:59:59.999`);
  const start = new Date(`${s.date}T${s.start_time}`);
  return new Date(start.getTime() + (s.duration || 60) * 60_000);
}

/** Bookable: active, not a test session, not yet ended. */
export function isBookable(s: FeedSessionLike, now: Date): boolean {
  if (s.is_test) return false;
  if (s.status != null && s.status !== 'active') return false;
  return sessionEndsAt(s) > now;
}

/** The series a session belongs to, or null for a one-off. */
export function seriesKey(s: FeedSessionLike): string | null {
  return s.recurring_parent_id ?? (s.is_recurring ? s.id : null);
}

/** Monday-first weekday of a YYYY-MM-DD date (0 = Monday ... 6 = Sunday). */
export function mondayWeekday(ymd: string): number {
  return (startOf(ymd).getDay() + 6) % 7;
}

/** Each series once (its next occurrence, with its weekdays); one-offs as they are. Keeps time order. */
export function collapseSeries<S extends FeedSessionLike>(sessions: S[]): FeedItem<S>[] {
  const sorted = [...sessions].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.start_time ?? '').localeCompare(b.start_time ?? '')
  );
  const days = new Map<string, Set<number>>();
  for (const s of sorted) {
    const key = seriesKey(s);
    if (!key) continue;
    if (!days.has(key)) days.set(key, new Set());
    days.get(key)!.add(mondayWeekday(s.date));
  }
  const seen = new Set<string>();
  const items: FeedItem<S>[] = [];
  for (const s of sorted) {
    const key = seriesKey(s);
    if (!key) {
      items.push({ session: s, seriesDays: null });
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ session: s, seriesDays: [...days.get(key)!].sort((a, b) => a - b) });
  }
  return items;
}

/** Which header a date goes under, seen from `now`. */
export function groupKeyFor(ymd: string, now: Date): FeedGroupKey {
  const diff = Math.round((startOf(ymd).getTime() - startOf(localYmd(now)).getTime()) / DAY_MS);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff <= 6) return 'weekday';
  return 'later';
}

/** The feed, bookable sessions only, each series once, under its day header. */
export function groupFeed<S extends FeedSessionLike>(sessions: S[], now: Date = new Date()): FeedGroup<S>[] {
  const items = collapseSeries(sessions.filter((s) => isBookable(s, now)));
  const groups: FeedGroup<S>[] = [];
  for (const item of items) {
    const key = groupKeyFor(item.session.date, now);
    const date = key === 'later' ? null : item.session.date;
    const last = groups[groups.length - 1];
    if (last && last.key === key && last.date === date) last.items.push(item);
    else {
      const existing = key === 'later' ? groups.find((g) => g.key === 'later') : undefined;
      if (existing) existing.items.push(item);
      else groups.push({ key, date, items: [item] });
    }
  }
  return groups;
}

const WEEKDAY_SHORT: Record<'es' | 'en', string[]> = {
  es: ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};
const WEEKDAY_LONG: Record<'es' | 'en', string[]> = {
  es: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
};

/** "lun · mié · vie" */
export function seriesDaysLabel(days: number[], language: 'es' | 'en'): string {
  return days.map((d) => WEEKDAY_SHORT[language][d]).join(' · ');
}

const FIXED_TITLES: Record<'es' | 'en', Record<'today' | 'tomorrow' | 'later', string>> = {
  es: { today: 'Hoy', tomorrow: 'Mañana', later: 'Más adelante' },
  en: { today: 'Today', tomorrow: 'Tomorrow', later: 'Later' },
};

/** "Hoy", "Mañana", "Miércoles", "Más adelante" (EN: Today, Tomorrow, Wednesday, Later). */
export function groupTitle(group: Pick<FeedGroup<unknown>, 'key' | 'date'>, language: 'es' | 'en'): string {
  if (group.key === 'weekday' && group.date) return WEEKDAY_LONG[language][mondayWeekday(group.date)];
  return FIXED_TITLES[language][group.key === 'weekday' ? 'later' : group.key];
}

/** The sports on the feed, most sessions first, for the filter row. */
export function feedSports(sessions: { sport?: string | null }[]): string[] {
  const counts = new Map<string, number>();
  for (const s of sessions) if (s.sport) counts.set(s.sport, (counts.get(s.sport) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([sport]) => sport);
}

/** The first `limit` cards of the feed, keeping their headers ("Mostrar más" adds the rest). */
export function limitGroups<S>(groups: FeedGroup<S>[], limit: number): FeedGroup<S>[] {
  const out: FeedGroup<S>[] = [];
  let left = limit;
  for (const g of groups) {
    if (left <= 0) break;
    out.push({ ...g, items: g.items.slice(0, left) });
    left -= g.items.length;
  }
  return out;
}
