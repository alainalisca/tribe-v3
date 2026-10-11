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

const ES_MONTHS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

const EN_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function weekLabel(week: WeekRange, lang: 'en' | 'es'): string {
  const m = new Date(week.monday + 'T12:00:00Z');
  const s = new Date(week.sunday + 'T12:00:00Z');
  const months = lang === 'es' ? ES_MONTHS : EN_MONTHS;
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
