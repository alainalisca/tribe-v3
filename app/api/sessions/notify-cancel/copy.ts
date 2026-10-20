import type { NotificationLang } from '@/lib/notification-i18n';

/** "lunes 20 de octubre" / "Monday, October 20". Noon, so no timezone shifts the day. */
export function cancelDate(date: string, lang: NotificationLang): string {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  if (lang === 'en') return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
}
