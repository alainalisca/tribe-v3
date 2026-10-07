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

const ES_WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
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
