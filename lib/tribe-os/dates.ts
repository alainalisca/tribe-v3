/**
 * Bogota-aware relative date helpers for the briefing card.
 *
 * Rules:
 *   - Same day        → "hoy"
 *   - Yesterday       → "ayer"
 *   - Tomorrow        → "mañana"
 *   - 2-6 days ahead  → weekday name ("el viernes")
 *   - 2-7 days back   → "el {weekday} pasado"
 *   - Further out     → "{weekday} {day} de {month}"
 */

const BOGOTA = 'America/Bogota';

export const ES_WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const EN_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ES_MONTHS = [
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
export const ES_MONTHS_ABBR = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];
export const EN_MONTHS_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function bogotaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BOGOTA });
}

export function bogotaWeekdayName(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const bogota = new Date(d.toLocaleString('en-US', { timeZone: BOGOTA }));
  return ES_WEEKDAYS[bogota.getDay()];
}

export function bogotaDateLabel(today: string): string {
  const d = new Date(today + 'T12:00:00Z');
  const bogota = new Date(d.toLocaleString('en-US', { timeZone: BOGOTA }));
  const day = bogota.getDate();
  const weekday = bogotaWeekdayName(today);
  return `Hoy, ${weekday} ${day} de ${ES_MONTHS[bogota.getMonth()]}`;
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayDiff(today: string, target: string): number {
  const t = new Date(today + 'T00:00:00Z').getTime();
  const d = new Date(target + 'T00:00:00Z').getTime();
  return Math.round((d - t) / 86_400_000);
}

export function relativeDateLabel(today: string, dateStr: string): string {
  const diff = dayDiff(today, dateStr);
  const weekday = bogotaWeekdayName(dateStr);

  if (diff === 0) return 'hoy';
  if (diff === -1) return 'ayer';
  if (diff === 1) return 'mañana';
  if (diff >= 2 && diff <= 6) return `el ${weekday}`;
  if (diff >= -7 && diff <= -2) return `el ${weekday} pasado`;

  const d = new Date(dateStr + 'T12:00:00Z');
  const bogota = new Date(d.toLocaleString('en-US', { timeZone: BOGOTA }));
  return `${weekday} ${bogota.getDate()} de ${ES_MONTHS[bogota.getMonth()]}`;
}

export function planExpiryLabel(today: string, planEndsOn: string): string {
  const diff = dayDiff(today, planEndsOn);
  const rel = relativeDateLabel(today, planEndsOn);

  if (diff < 0) {
    return rel === 'ayer' ? 'venció ayer' : `venció ${rel}`;
  }
  if (diff === 0) return 'vence hoy';
  return `vence ${rel}`;
}

export function planExpiryLabelBi(today: string, planEndsOn: string, lang: 'en' | 'es'): string {
  if (lang === 'es') return planExpiryLabel(today, planEndsOn);
  const diff = dayDiff(today, planEndsOn);
  if (diff < 0) return diff === -1 ? 'expired yesterday' : `expired ${formatDateEn(planEndsOn)}`;
  if (diff === 0) return 'expires today';
  if (diff === 1) return 'expires tomorrow';
  return `expires ${formatDateEn(planEndsOn)}`;
}

function formatDateEn(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return `${EN_MONTHS_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function bogotaNowLocal(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: BOGOTA }).slice(0, 16).replace(' ', 'T');
}

export function bogotaTomorrowLocal(hour = 18, minute = 0): string {
  const nowStr = new Date().toLocaleString('en-US', { timeZone: BOGOTA });
  const bogotaNow = new Date(nowStr);
  bogotaNow.setDate(bogotaNow.getDate() + 1);
  bogotaNow.setHours(hour, minute, 0, 0);
  const y = bogotaNow.getFullYear();
  const m = String(bogotaNow.getMonth() + 1).padStart(2, '0');
  const d = String(bogotaNow.getDate()).padStart(2, '0');
  const h = String(bogotaNow.getHours()).padStart(2, '0');
  const min = String(bogotaNow.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

export function bogotaLocalToUtc(localStr: string): string {
  return new Date(localStr + ':00-05:00').toISOString();
}

export function utcToBogotaLocal(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE', { timeZone: BOGOTA }).slice(0, 16).replace(' ', 'T');
}

export function formatShortDateBi(iso: string, lang: 'en' | 'es'): string {
  const d = new Date(iso);
  const bogota = new Date(d.toLocaleString('en-US', { timeZone: BOGOTA }));
  const day = bogota.getDate();
  const months = lang === 'es' ? ES_MONTHS_ABBR : EN_MONTHS_ABBR;
  return `${day} ${months[bogota.getMonth()]}`;
}

export function formatDateTimeBi(iso: string, lang: 'en' | 'es'): string {
  const d = new Date(iso);
  const bogota = new Date(d.toLocaleString('en-US', { timeZone: BOGOTA }));
  const day = bogota.getDate();
  const months = lang === 'es' ? ES_MONTHS_ABBR : EN_MONTHS_ABBR;
  let hours = bogota.getHours();
  const minutes = bogota.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? (lang === 'es' ? 'p. m.' : 'PM') : (lang === 'es' ? 'a. m.' : 'AM');
  hours = hours % 12 || 12;
  return `${day} ${months[bogota.getMonth()]}, ${hours}:${minutes} ${ampm}`;
}
