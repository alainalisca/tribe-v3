/**
 * Period helpers for the revenue dashboard.
 *
 * All preset periods (this week, this month, last month, etc.) are
 * computed in the instructor's local timezone via Intl.DateTimeFormat,
 * not browser-default UTC. A payment at 23:45 local on the last day
 * of a period lives in that period, not the next.
 *
 * Period values use INCLUSIVE date strings on both ends ('YYYY-MM-DD'
 * format) to match the public API contract. The DAL converts to the
 * SQL function's exclusive-end convention internally.
 *
 * Week boundaries follow Monday-Sunday (ISO 8601), the Latin-American
 * convention. If we ever need Sunday-start for the US market we'll
 * pivot via the instructor profile.
 */

export type PresetKey = 'this_week' | 'this_month' | 'last_month' | 'last_3_months' | 'ytd' | 'all_time' | 'custom';

export interface Period {
  /** Inclusive ISO date (YYYY-MM-DD), in the instructor's local timezone. */
  from: string;
  /** Inclusive ISO date (YYYY-MM-DD), in the instructor's local timezone. */
  to: string;
  /** Human label for display in the page header. */
  label: string;
  /** Which preset produced this period. 'custom' for manually selected ranges. */
  preset: PresetKey;
}

/** Pull the browser's IANA timezone, falling back to UTC if unavailable. */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Format any Date as YYYY-MM-DD in the given IANA timezone. */
export function isoDateInTimezone(d: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

interface YMD {
  year: number;
  month: number;
  day: number;
}

function parseYmd(iso: string): YMD {
  const [y, m, d] = iso.split('-').map(Number);
  return { year: y, month: m, day: d };
}

function ymdToIso(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

/** Days in a given calendar month (1-12). */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Subtracts N days from an ISO date, in UTC. */
function addDays(iso: string, days: number): string {
  const { year, month, day } = parseYmd(iso);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return ymdToIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Computes the Monday of the week containing the given local date.
 *  Treats ISO week (Monday-start). */
function startOfWeek(iso: string): string {
  const { year, month, day } = parseYmd(iso);
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = d.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // days to subtract to reach Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return ymdToIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

// ---- Localized labels ----

const MONTH_NAMES_EN = [
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
];
const MONTH_NAMES_ES = [
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
];

function monthYearLabel(month: number, year: number, language: 'en' | 'es'): string {
  const names = language === 'es' ? MONTH_NAMES_ES : MONTH_NAMES_EN;
  return `${names[month - 1]} ${year}`;
}

/** Short label like "May 12 – May 18" or "12 may – 18 may". */
function rangeShortLabel(fromIso: string, toIso: string, language: 'en' | 'es'): string {
  const { year: y1, month: m1, day: d1 } = parseYmd(fromIso);
  const { year: y2, month: m2, day: d2 } = parseYmd(toIso);
  const names = language === 'es' ? MONTH_NAMES_ES : MONTH_NAMES_EN;
  const formatOne = (y: number, m: number, d: number): string =>
    language === 'es' ? `${d} ${names[m - 1]}` : `${names[m - 1]} ${d}`;
  const left = formatOne(y1, m1, d1);
  const right = formatOne(y2, m2, d2);
  // If the year crosses, append the years for disambiguation.
  if (y1 !== y2) return `${left} ${y1} - ${right} ${y2}`;
  return `${left} - ${right}`;
}

// ---- Preset constructors ----

export function thisWeekPeriod(timezone: string, language: 'en' | 'es'): Period {
  const todayIso = isoDateInTimezone(new Date(), timezone);
  const fromIso = startOfWeek(todayIso);
  return {
    from: fromIso,
    to: todayIso,
    label: rangeShortLabel(fromIso, todayIso, language),
    preset: 'this_week',
  };
}

export function thisMonthPeriod(timezone: string, language: 'en' | 'es'): Period {
  const todayIso = isoDateInTimezone(new Date(), timezone);
  const { year, month } = parseYmd(todayIso);
  return {
    from: ymdToIso(year, month, 1),
    to: todayIso,
    label: monthYearLabel(month, year, language),
    preset: 'this_month',
  };
}

export function lastMonthPeriod(timezone: string, language: 'en' | 'es'): Period {
  const todayIso = isoDateInTimezone(new Date(), timezone);
  const { year, month } = parseYmd(todayIso);
  const lmYear = month === 1 ? year - 1 : year;
  const lmMonth = month === 1 ? 12 : month - 1;
  const lastDay = daysInMonth(lmYear, lmMonth);
  return {
    from: ymdToIso(lmYear, lmMonth, 1),
    to: ymdToIso(lmYear, lmMonth, lastDay),
    label: monthYearLabel(lmMonth, lmYear, language),
    preset: 'last_month',
  };
}

export function last3MonthsPeriod(timezone: string, language: 'en' | 'es'): Period {
  const todayIso = isoDateInTimezone(new Date(), timezone);
  const { year, month } = parseYmd(todayIso);
  // Start of 2 months ago (e.g. today = May, start = March 1).
  let startMonth = month - 2;
  let startYear = year;
  if (startMonth < 1) {
    startMonth += 12;
    startYear -= 1;
  }
  return {
    from: ymdToIso(startYear, startMonth, 1),
    to: todayIso,
    label: language === 'es' ? 'últimos 3 meses' : 'last 3 months',
    preset: 'last_3_months',
  };
}

export function ytdPeriod(timezone: string, language: 'en' | 'es'): Period {
  const todayIso = isoDateInTimezone(new Date(), timezone);
  const { year } = parseYmd(todayIso);
  return {
    from: `${year}-01-01`,
    to: todayIso,
    label: language === 'es' ? `año ${year}` : `${year} year to date`,
    preset: 'ytd',
  };
}

export function allTimePeriod(timezone: string, language: 'en' | 'es'): Period {
  return {
    from: '2020-01-01',
    to: isoDateInTimezone(new Date(), timezone),
    label: language === 'es' ? 'todo el tiempo' : 'all time',
    preset: 'all_time',
  };
}

export function customPeriod(fromIso: string, toIso: string, language: 'en' | 'es'): Period {
  return {
    from: fromIso,
    to: toIso,
    label: rangeShortLabel(fromIso, toIso, language),
    preset: 'custom',
  };
}

// Re-export helpers used by other modules.
export { addDays };
