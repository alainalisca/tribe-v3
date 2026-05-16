/**
 * Bilingual "unusual activity in your gym" alert email.
 *
 * Sent by the audit watchdog cron when a gym crosses a destructive-
 * action threshold — e.g. a coach archives 5+ members in 24 hours
 * or hard-purges any client. Lands in the gym owner's inbox with
 * a per-alert summary and a deep-link to /os/audit so they can
 * see the events themselves.
 *
 * Tone is deliberately non-alarmist. Most legitimate clusters
 * (a coach doing roster cleanup before a new season) trip these
 * thresholds the same way a hostile burst would, so the framing
 * is "we noticed this — take a look" rather than "you have been
 * attacked."
 *
 * NOT a security incident notification in the formal sense — we
 * don't have signing keys or breach detection. It's an
 * accountability signal: the audit log captured something
 * unusual, and the gym owner should see it.
 *
 * Spanish copy is pending Verónica's review.
 */

import { Resend } from 'resend';
import { APP_STORE_URL, GOOGLE_PLAY_URL, INSTAGRAM_HANDLE } from './tribeOsWaitlist';

const FROM = 'Tribe <tribe@aplusfitnessllc.com>';

export interface AuditAlertItem {
  action: string;
  /** Display name of the actor — falls back to email or "Unknown" if missing. */
  actor_label: string;
  /**
   * Underlying actor id, or null for `alertOnAny` rules where the
   * alert isn't tied to a single actor. Drives the "by Carlos" line
   * rendering — hidden when null.
   */
  actor_user_id: string | null;
  count: number;
  window_hours: number;
  earliest_at: string;
  latest_at: string;
}

export interface AuditAlertEmailParams {
  /** Gym owner — recipient. */
  ownerEmail: string;
  ownerName: string | null;
  /** Owner's preferred language (en/es). Defaults to en when missing. */
  language: 'en' | 'es';
  /** Display name of the gym, for subject + body. */
  gymName: string;
  /** Triggered alerts, already passed through the suppression check. */
  alerts: AuditAlertItem[];
}

function getResendClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ES PENDING VERONICA REVIEW
const ACTION_LABELS: Record<string, { en: string; es: string }> = {
  'client.archive': { en: 'Members archived', es: 'Miembros archivados' },
  'client.purge': { en: 'Members permanently deleted', es: 'Miembros eliminados permanentemente' },
  'attendance.delete': { en: 'Attendance rows deleted', es: 'Asistencias eliminadas' },
  'attendance.refund': { en: 'Refunds issued', es: 'Reembolsos emitidos' },
};

const copy = {
  en: {
    subject: (gymName: string) => `Unusual activity in ${gymName}`,
    eyebrow: 'Audit watchdog',
    headline: (gymName: string) => `We noticed something in ${gymName}.`,
    intro:
      "Tribe.OS watches your gym's audit log for clusters of destructive actions. We're surfacing this because the activity below crossed a threshold we set conservatively — most likely it's a coach doing legitimate roster work, but it's worth a quick look so nothing slips by you.",
    eventsHeader: 'What we saw',
    actorBy: (label: string) => `by ${label}`,
    countLine: (count: number, action: string, windowHours: number) =>
      `${count} ${action.toLowerCase()} in the last ${windowHours} ${windowHours === 1 ? 'hour' : 'hours'}`,
    actionLabel: (action: string) => ACTION_LABELS[action]?.en ?? action,
    rangeLine: (earliest: string, latest: string) => `Between ${earliest} and ${latest}`,
    ctaLabel: 'View the audit log',
    closing:
      "Nothing about this email is automated beyond detection — there's no policy enforcement, no auto-revert, no account locking. You decide what (if anything) to do next.",
    quietHours:
      "We won't email you again about the same coach + action combo for 24 hours, so you'll only hear from us once per incident.",
    sign: 'Alain\nA Plus Fitness LLC',
    appStoreLabel: 'App Store',
    googlePlayLabel: 'Google Play',
    instagramLabel: 'Instagram',
  },
  es: {
    subject: (gymName: string) => `Actividad inusual en ${gymName}`,
    eyebrow: 'Vigilancia de auditoría',
    headline: (gymName: string) => `Notamos algo en ${gymName}.`,
    intro:
      'Tribe.OS observa el registro de auditoría de tu gym buscando grupos de acciones destructivas. Te avisamos porque la actividad de abajo cruzó un umbral que dejamos conservador — lo más probable es que sea un coach haciendo limpieza legítima, pero vale la pena revisar para que nada se te escape.',
    eventsHeader: 'Lo que vimos',
    actorBy: (label: string) => `por ${label}`,
    countLine: (count: number, action: string, windowHours: number) =>
      `${count} ${action.toLowerCase()} en las últimas ${windowHours} ${windowHours === 1 ? 'hora' : 'horas'}`,
    actionLabel: (action: string) => ACTION_LABELS[action]?.es ?? action,
    rangeLine: (earliest: string, latest: string) => `Entre ${earliest} y ${latest}`,
    ctaLabel: 'Ver el registro de auditoría',
    closing:
      'Nada en este correo es automático más allá de la detección — no hay aplicación de políticas, ni reversión automática, ni bloqueo de cuentas. Tú decides qué hacer (si es que algo hace falta).',
    quietHours:
      'No te volveremos a escribir sobre la misma combinación coach + acción por 24 horas, así que solo sabrás de nosotros una vez por incidente.',
    sign: 'Alain\nA Plus Fitness LLC',
    appStoreLabel: 'App Store',
    googlePlayLabel: 'Google Play',
    instagramLabel: 'Instagram',
  },
} as const;

/** Format an ISO timestamp into a human-readable local date+time. */
function formatTimestamp(iso: string, lang: 'en' | 'es'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(lang === 'es' ? 'es-CO' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function renderHtml(params: AuditAlertEmailParams, siteUrl: string): string {
  const c = copy[params.language];
  const gymName = escapeHtml(params.gymName);
  const ctaUrl = `${siteUrl}/os/audit`;

  const eventsHtml = params.alerts
    .map((alert) => {
      const actionLabel = escapeHtml(c.actionLabel(alert.action));
      const countLine = escapeHtml(c.countLine(alert.count, actionLabel, alert.window_hours));
      const rangeLine = escapeHtml(
        c.rangeLine(
          formatTimestamp(alert.earliest_at, params.language),
          formatTimestamp(alert.latest_at, params.language)
        )
      );
      const actorLine = alert.actor_user_id
        ? `<p style="margin: 0 0 4px; font-size: 13px; color: #6b7280;">${escapeHtml(c.actorBy(alert.actor_label))}</p>`
        : '';
      return `
        <div style="border: 1px solid #fcd34d; background: #fffbeb; border-radius: 8px; padding: 14px 16px; margin: 0 0 12px;">
          <p style="margin: 0 0 4px; font-size: 15px; font-weight: 700; color: #1f2937;">${countLine}</p>
          ${actorLine}
          <p style="margin: 0; font-size: 12px; color: #9ca3af;">${rangeLine}</p>
        </div>
      `;
    })
    .join('');

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 24px;">
      <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.08);">
        <div style="background: #272D34; padding: 28px 28px 22px;">
          <div style="font-size: 26px; font-weight: 900; color: white; line-height: 1; letter-spacing: -0.02em; margin: 0 0 22px;">Tribe<span style="color: #9EE551;">.</span></div>
          <p style="margin: 0; color: #fcd34d; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600;">${escapeHtml(c.eyebrow)}</p>
          <h1 style="margin: 8px 0 0; color: white; font-size: 22px; font-weight: 800; line-height: 1.25;">${escapeHtml(c.headline(gymName))}</h1>
        </div>
        <div style="padding: 26px 28px 12px;">
          <p style="margin: 0 0 22px; font-size: 14px; line-height: 1.6; color: #1f2937;">${escapeHtml(c.intro)}</p>

          <h2 style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em;">${escapeHtml(c.eventsHeader)}</h2>
          ${eventsHtml}

          <div style="text-align: center; margin: 18px 0 6px;">
            <a href="${ctaUrl}" style="display: inline-block; font-size: 14px; font-weight: 700; color: #272D34; background: #9EE551; padding: 12px 22px; border-radius: 999px; text-decoration: none;">${escapeHtml(c.ctaLabel)} →</a>
          </div>

          <p style="margin: 18px 0 0; font-size: 13px; line-height: 1.55; color: #6b7280;">${escapeHtml(c.closing)}</p>
          <p style="margin: 12px 0 0; font-size: 12px; line-height: 1.55; color: #9ca3af; font-style: italic;">${escapeHtml(c.quietHours)}</p>
          <p style="margin: 22px 0 0; font-size: 14px; color: #6b7280; white-space: pre-line;">${escapeHtml(c.sign)}</p>
        </div>
        <div style="background: #f3f4f6; padding: 18px 28px; border-top: 1px solid #e5e7eb; font-size: 13px;">
          <a href="${APP_STORE_URL}" style="color: #4b5563; text-decoration: none; margin-right: 16px;">${escapeHtml(c.appStoreLabel)}</a>
          <a href="${GOOGLE_PLAY_URL}" style="color: #4b5563; text-decoration: none; margin-right: 16px;">${escapeHtml(c.googlePlayLabel)}</a>
          <span style="color: #6b7280;">${escapeHtml(c.instagramLabel)} ${INSTAGRAM_HANDLE}</span>
        </div>
      </div>
    </div>
  `.trim();
}

function renderText(params: AuditAlertEmailParams, siteUrl: string): string {
  const c = copy[params.language];
  const ctaUrl = `${siteUrl}/os/audit`;
  const events = params.alerts
    .map((alert) => {
      const actionLabel = c.actionLabel(alert.action);
      const lines: string[] = [`  • ${c.countLine(alert.count, actionLabel, alert.window_hours)}`];
      if (alert.actor_user_id) {
        lines.push(`    ${c.actorBy(alert.actor_label)}`);
      }
      lines.push(
        `    ${c.rangeLine(formatTimestamp(alert.earliest_at, params.language), formatTimestamp(alert.latest_at, params.language))}`
      );
      return lines.join('\n');
    })
    .join('\n\n');

  return [
    c.headline(params.gymName),
    '',
    c.intro,
    '',
    `${c.eventsHeader}:`,
    events,
    '',
    `${c.ctaLabel}: ${ctaUrl}`,
    '',
    c.closing,
    '',
    c.quietHours,
    '',
    c.sign,
    '',
    `App Store: ${APP_STORE_URL}`,
    `Google Play: ${GOOGLE_PLAY_URL}`,
    `Instagram: ${INSTAGRAM_HANDLE}`,
  ].join('\n');
}

/**
 * Send the alert. Throws on Resend error; caller decides log-and-continue.
 * The list of alerts is rendered into one email — we batch per gym so a
 * gym with three triggered rules gets one email, not three.
 */
export async function sendAuditAlertEmail(params: AuditAlertEmailParams, siteUrl: string): Promise<void> {
  const resend = getResendClient();
  await resend.emails.send({
    from: FROM,
    to: params.ownerEmail,
    subject: copy[params.language].subject(params.gymName),
    html: renderHtml(params, siteUrl),
    text: renderText(params, siteUrl),
  });
}
