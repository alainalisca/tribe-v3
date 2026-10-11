import { ES_MONTHS_ABBR, EN_MONTHS_ABBR, ES_WEEKDAYS } from '@/lib/tribe-os/dates';

const BOGOTA_TZ = 'America/Bogota';
const FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: BOGOTA_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function toBogotaDate(iso: string): string {
  const d = new Date(iso);
  const p = FMT.formatToParts(d);
  const y = p.find((x) => x.type === 'year')!.value;
  const m = p.find((x) => x.type === 'month')!.value;
  const day = p.find((x) => x.type === 'day')!.value;
  return `${y}-${m}-${day}`;
}

export interface WeekRange {
  monday: string;
  sunday: string;
}

export function lastCompletedWeek(todayBogota: string): WeekRange {
  const td = new Date(todayBogota + 'T12:00:00Z');
  const dow = td.getUTCDay();
  const mondayOffset = dow === 0 ? 6 : dow - 1;
  const thisMonday = new Date(td);
  thisMonday.setUTCDate(thisMonday.getUTCDate() - mondayOffset);
  const prevMonday = new Date(thisMonday);
  prevMonday.setUTCDate(prevMonday.getUTCDate() - 7);
  const prevSunday = new Date(prevMonday);
  prevSunday.setUTCDate(prevSunday.getUTCDate() + 6);
  return {
    monday: prevMonday.toISOString().slice(0, 10),
    sunday: prevSunday.toISOString().slice(0, 10),
  };
}

export function weekNAgo(todayBogota: string, n: number): WeekRange {
  const base = lastCompletedWeek(todayBogota);
  const m = new Date(base.monday + 'T12:00:00Z');
  m.setUTCDate(m.getUTCDate() - n * 7);
  const s = new Date(m);
  s.setUTCDate(s.getUTCDate() + 6);
  return {
    monday: m.toISOString().slice(0, 10),
    sunday: s.toISOString().slice(0, 10),
  };
}

export function previousWeeks(todayBogota: string, count: number): WeekRange[] {
  const weeks: WeekRange[] = [];
  for (let i = 0; i < count; i++) {
    weeks.push(weekNAgo(todayBogota, i));
  }
  return weeks;
}

export function weekLabel(week: WeekRange, lang: 'en' | 'es'): string {
  const m = new Date(week.monday + 'T12:00:00Z');
  const s = new Date(week.sunday + 'T12:00:00Z');
  const months = lang === 'es' ? ES_MONTHS_ABBR : EN_MONTHS_ABBR;
  const md = m.getUTCDate();
  const sd = s.getUTCDate();
  const mm = months[m.getUTCMonth()];
  const sm = months[s.getUTCMonth()];
  if (mm === sm) {
    return lang === 'es'
      ? `Semana del ${md} al ${sd} de ${mm}`
      : `Week of ${mm} ${md} to ${sd}`;
  }
  return lang === 'es'
    ? `Semana del ${md} de ${mm} al ${sd} de ${sm}`
    : `Week of ${mm} ${md} to ${sm} ${sd}`;
}

export function isInWeek(isoDate: string, week: WeekRange): boolean {
  const d = toBogotaDate(isoDate);
  return d >= week.monday && d <= week.sunday;
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export function findReturnVisitDate(
  touch: { client_id: string; created_at: string },
  visits: { client_id: string; visited_at: string }[],
): string | null {
  const touchMs = new Date(touch.created_at).getTime();
  let earliest: string | null = null;
  let earliestMs = Infinity;
  for (const v of visits) {
    if (v.client_id !== touch.client_id) continue;
    const vMs = new Date(v.visited_at).getTime();
    if (vMs <= touchMs) continue;
    if (vMs - touchMs > FOURTEEN_DAYS_MS) continue;
    if (vMs < earliestMs) {
      earliestMs = vMs;
      earliest = v.visited_at;
    }
  }
  return earliest;
}

export interface ClassSlot {
  className: string;
  weekday: number;
  hour: number;
  weekdayName: string;
  visits: number;
}

export function toBogotaWeekdayAndHour(isoDate: string): { weekday: number; hour: number } {
  const d = new Date(isoDate);
  const bogota = new Date(d.toLocaleString('en-US', { timeZone: BOGOTA_TZ }));
  return { weekday: bogota.getDay(), hour: bogota.getHours() };
}

export function formatClassSlot(slot: ClassSlot, lang: 'en' | 'es'): string {
  const dayName = lang === 'es'
    ? ES_WEEKDAYS[slot.weekday]
    : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][slot.weekday];
  const hour12 = slot.hour % 12 || 12;
  const ampm = lang === 'es'
    ? (slot.hour < 12 ? 'a. m.' : 'p. m.')
    : (slot.hour < 12 ? 'AM' : 'PM');
  const vLabel = lang === 'es'
    ? (slot.visits === 1 ? '1 visita' : `${slot.visits} visitas`)
    : (slot.visits === 1 ? '1 visit' : `${slot.visits} visits`);
  return `${slot.className}, ${dayName} ${hour12}:00 ${ampm} (${vLabel})`;
}
