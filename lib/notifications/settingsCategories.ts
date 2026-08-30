import type { NotificationCategory } from '@/lib/dal/notificationPreferences';

/**
 * The category toggles shown on /settings/notifications, in display order.
 *
 * SINGLE SOURCE OF TRUTH: the settings page renders from this list and the
 * gating invariant test (notificationPreferences.invariant.test.ts) reads the
 * same list. Neither hand-copies the keys, so the "every visible toggle gates a
 * real type, and every gated type has a visible toggle" invariant cannot drift.
 * Add or remove a user-facing category here, nowhere else.
 */
export interface SettingsCategory {
  key: NotificationCategory;
  title: { en: string; es: string };
  desc: { en: string; es: string };
}

export const SETTINGS_NOTIFICATION_CATEGORIES: SettingsCategory[] = [
  {
    key: 'session_reminders',
    title: { en: 'Session Reminders', es: 'Recordatorios de Sesión' },
    desc: { en: '1 hour and 15 min before', es: '1 hora y 15 min antes' },
  },
  {
    key: 'session_updates',
    title: { en: 'Session Updates', es: 'Actualizaciones de Sesión' },
    desc: { en: 'Changes, cancellations, waitlist', es: 'Cambios, cancelaciones, lista de espera' },
  },
  {
    key: 'social_activity',
    title: { en: 'Social Activity', es: 'Actividad Social' },
    desc: { en: 'Follows, likes, comments', es: 'Seguidores, me gusta, comentarios' },
  },
  {
    key: 'proximity_alerts',
    title: { en: 'Training near you', es: 'Entrenar cerca de ti' },
    desc: { en: 'Someone nearby wants to train now', es: 'Alguien cerca quiere entrenar ahora' },
  },
  {
    key: 'messages',
    title: { en: 'Messages', es: 'Mensajes' },
    desc: { en: 'Direct messages, session chat', es: 'Mensajes directos, chat de sesión' },
  },
  {
    key: 'training_nudges',
    title: { en: 'Training Nudges', es: 'Recordatorios de Entrenamiento' },
    desc: { en: 'Streaks, habits, comeback', es: 'Rachas, hábitos, regresos' },
  },
  {
    key: 'instructor_updates',
    title: { en: 'Instructor Updates', es: 'Actualizaciones de Instructores' },
    desc: { en: 'New posts and sessions', es: 'Nuevas publicaciones y sesiones' },
  },
  {
    key: 'challenges',
    title: { en: 'Challenges', es: 'Desafíos' },
    desc: { en: 'Progress and new challenges', es: 'Progreso y nuevos desafíos' },
  },
  {
    key: 'marketing',
    title: { en: 'Marketing & Promotions', es: 'Marketing y Promociones' },
    desc: { en: 'Spotlight, special offers', es: 'Destacados, ofertas especiales' },
  },
  {
    key: 'weekly_recap',
    title: { en: 'Weekly Recap', es: 'Resumen Semanal' },
    desc: { en: 'Training summary every Sunday', es: 'Resumen de entrenamiento cada domingo' },
  },
];
