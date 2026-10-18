/**
 * T-JOIN1 Part C. "Hace 3 meses", never "hace 3 mes": ONE relative-date
 * formatter for every athlete-facing surface, in Spanish or English.
 *
 * Intl.RelativeTimeFormat owns the words and the plurals, so nothing here
 * builds a Spanish noun by hand. `numeric: 'auto'` gives the natural forms
 * ("ahora", "ayer", "la semana pasada", "el mes pasado"); everything else is
 * "hace N <unidad>" / "N <units> ago". A date in the future reads "en N ..." /
 * "in N ...".
 *
 * Units step up at the usual points: under 45 seconds is "ahora", then
 * minutes, hours, days (under 7), weeks (under 30 days), months (under 365
 * days), years. Months and years are counted in 30 and 365 days: a relative
 * label is a rough distance, not a calendar.
 */
export type RelativeLang = 'es' | 'en';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const formatters = new Map<RelativeLang, Intl.RelativeTimeFormat>();
function formatter(lang: RelativeLang): Intl.RelativeTimeFormat {
  let f = formatters.get(lang);
  if (!f) {
    f = new Intl.RelativeTimeFormat(lang === 'en' ? 'en' : 'es', { numeric: 'auto' });
    formatters.set(lang, f);
  }
  return f;
}

export function formatRelative(
  date: string | number | Date | null | undefined,
  lang: RelativeLang,
  now: Date = new Date()
): string {
  if (date === null || date === undefined || date === '') return '';
  const then = date instanceof Date ? date : new Date(date);
  const ms = then.getTime();
  if (Number.isNaN(ms)) return '';
  const diff = ms - now.getTime();
  const abs = Math.abs(diff);
  const sign = diff < 0 ? -1 : 1;
  const f = formatter(lang);

  if (abs < 45 * SECOND) return f.format(0, 'second');
  if (abs < HOUR) return f.format(sign * Math.max(1, Math.round(abs / MINUTE)), 'minute');
  if (abs < DAY) return f.format(sign * Math.round(abs / HOUR), 'hour');
  if (abs < 7 * DAY) return f.format(sign * Math.round(abs / DAY), 'day');
  if (abs < 30 * DAY) return f.format(sign * Math.round(abs / (7 * DAY)), 'week');
  if (abs < 365 * DAY) return f.format(sign * Math.max(1, Math.round(abs / (30 * DAY))), 'month');
  return f.format(sign * Math.round(abs / (365 * DAY)), 'year');
}
