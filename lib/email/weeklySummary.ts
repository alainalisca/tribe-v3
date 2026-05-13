/**
 * Bilingual Monday-morning weekly summary email.
 *
 * Different signal than the intelligence digest:
 *   - Intelligence digest = "you have N new alerts" (reactive)
 *   - Weekly summary      = "here's last week" (reflective)
 *
 * Sent every Monday at 7am UTC (2am Medellín) so coaches start the
 * week with a snapshot of last week's gym activity in their inbox.
 *
 * Reuses the same FROM identity + brand styling as the other Tribe
 * emails. Per-gym opt-out shares the intelligence_email_enabled
 * flag from migration 081 — users who turn that off don't want any
 * proactive email from us.
 *
 * Spanish copy is pending Verónica's review.
 */

import { Resend } from 'resend';
import { APP_STORE_URL, GOOGLE_PLAY_URL, INSTAGRAM_HANDLE } from './tribeOsWaitlist';
import { formatCents } from '@/lib/format/currency';

const FROM = 'Tribe <tribe@aplusfitnessllc.com>';

export interface WeeklySummaryParams {
  ownerName: string;
  ownerEmail: string;
  language: 'en' | 'es';
  gymName: string;
  /** Stats covering the previous calendar week (Mon → Sun in gym's timezone). */
  stats: {
    sessionsRecorded: number;
    /** Distinct clients who attended at least one session. */
    uniqueAttenders: number;
    /** Total revenue in USD cents (we pick the dominant currency at send-time). */
    revenueCents: number;
    revenueCurrency: 'USD' | 'COP' | null;
    /** Top member by attendance count this week. */
    topAttender: { name: string; sessions: number } | null;
    /** Number of clients currently flagged AT_RISK. */
    atRiskCount: number;
    /** Total active insights (active + un-dismissed + un-expired). */
    activeInsights: number;
  };
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
const copy = {
  en: {
    subject: (gymName: string) => `Last week at ${gymName}`,
    eyebrow: 'Tribe.OS · Weekly summary',
    headline: (gymName: string) => `Last week at ${gymName}`,
    intro:
      "Here's the pulse — what happened in your gym last week. Numbers cover Monday through Sunday in your timezone.",
    sessionsLabel: 'Sessions recorded',
    attendersLabel: 'Unique attenders',
    revenueLabel: 'Revenue',
    atRiskLabel: 'Members at risk',
    activeInsightsLabel: 'Active alerts',
    topAttenderHeader: 'Top attender',
    topAttenderLine: (name: string, n: number) =>
      `${name} showed up ${n} ${n === 1 ? 'time' : 'times'} this week — worth a quick acknowledgment.`,
    noAttendersLine: "No attendance recorded this week. If that's a surprise, head to /os/dashboard to investigate.",
    ctaLabel: 'Open dashboard',
    optOutLine: "Don't want these? Turn them off in /os/gym settings.",
    sign: 'Alain\nA Plus Fitness LLC',
    appStoreLabel: 'App Store',
    googlePlayLabel: 'Google Play',
    instagramLabel: 'Instagram',
  },
  es: {
    subject: (gymName: string) => `La semana pasada en ${gymName}`,
    eyebrow: 'Tribe.OS · Resumen semanal',
    headline: (gymName: string) => `La semana pasada en ${gymName}`,
    intro:
      'Este es el pulso — lo que pasó en tu gym la semana pasada. Los números cubren de lunes a domingo en tu zona horaria.',
    sessionsLabel: 'Sesiones registradas',
    attendersLabel: 'Asistentes únicos',
    revenueLabel: 'Ingresos',
    atRiskLabel: 'Miembros en riesgo',
    activeInsightsLabel: 'Alertas activas',
    topAttenderHeader: 'Top asistente',
    topAttenderLine: (name: string, n: number) =>
      `${name} vino ${n} ${n === 1 ? 'vez' : 'veces'} esta semana — vale la pena reconocérselo.`,
    noAttendersLine: 'No hubo asistencias registradas esta semana. Si te sorprende, abre /os/dashboard para revisar.',
    ctaLabel: 'Abrir panel',
    optOutLine: '¿No los quieres? Desactívalos en la configuración en /os/gym.',
    sign: 'Alain\nA Plus Fitness LLC',
    appStoreLabel: 'App Store',
    googlePlayLabel: 'Google Play',
    instagramLabel: 'Instagram',
  },
} as const;

function renderHtml(params: WeeklySummaryParams, siteUrl: string): string {
  const c = copy[params.language];
  const s = params.stats;
  const ctaUrl = `${siteUrl}/os/dashboard/`;
  const revenueStr =
    s.revenueCents > 0 && s.revenueCurrency ? formatCents(s.revenueCents, s.revenueCurrency, params.language) : '—';

  const statTile = (label: string, value: string) => `
    <td style="padding: 16px; border: 1px solid #e5e7eb; border-radius: 10px; background: #ffffff; vertical-align: top;">
      <p style="margin: 0 0 4px; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em;">${escapeHtml(label)}</p>
      <p style="margin: 0; font-size: 24px; font-weight: 900; color: #111827;">${escapeHtml(value)}</p>
    </td>
  `;

  const topAttenderBlock = s.topAttender
    ? `
      <div style="margin: 18px 0 0; padding: 14px 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px;">
        <p style="margin: 0 0 4px; font-size: 11px; font-weight: 700; color: #15803d; text-transform: uppercase; letter-spacing: 0.06em;">${escapeHtml(c.topAttenderHeader)}</p>
        <p style="margin: 0; font-size: 14px; line-height: 1.55; color: #166534;">${escapeHtml(c.topAttenderLine(s.topAttender.name, s.topAttender.sessions))}</p>
      </div>
    `
    : s.sessionsRecorded === 0
      ? `<p style="margin: 18px 0 0; font-size: 13px; color: #6b7280; font-style: italic;">${escapeHtml(c.noAttendersLine)}</p>`
      : '';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 24px;">
      <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.08);">
        <div style="background: #272D34; padding: 28px 28px 22px;">
          <div style="font-size: 26px; font-weight: 900; color: white; line-height: 1; letter-spacing: -0.02em; margin: 0 0 22px;">Tribe<span style="color: #9EE551;">.</span></div>
          <p style="margin: 0; color: #9EE551; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600;">${escapeHtml(c.eyebrow)}</p>
          <h1 style="margin: 8px 0 0; color: white; font-size: 22px; font-weight: 800; line-height: 1.25;">${escapeHtml(c.headline(params.gymName))}</h1>
        </div>
        <div style="padding: 26px 28px 12px;">
          <p style="margin: 0 0 22px; font-size: 14px; line-height: 1.6; color: #1f2937;">${escapeHtml(c.intro)}</p>

          <table style="width: 100%; border-collapse: separate; border-spacing: 8px;">
            <tr>
              ${statTile(c.sessionsLabel, String(s.sessionsRecorded))}
              ${statTile(c.attendersLabel, String(s.uniqueAttenders))}
            </tr>
            <tr>
              ${statTile(c.revenueLabel, revenueStr)}
              ${statTile(c.atRiskLabel, String(s.atRiskCount))}
            </tr>
          </table>

          ${topAttenderBlock}

          <div style="text-align: center; margin: 24px 0 6px;">
            <a href="${ctaUrl}" style="display: inline-block; font-size: 14px; font-weight: 700; color: #272D34; background: #9EE551; padding: 12px 22px; border-radius: 999px; text-decoration: none;">${escapeHtml(c.ctaLabel)} →</a>
          </div>

          <p style="margin: 22px 0 6px; font-size: 12px; color: #9ca3af;">${escapeHtml(c.optOutLine)}</p>
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

function renderText(params: WeeklySummaryParams, siteUrl: string): string {
  const c = copy[params.language];
  const s = params.stats;
  const ctaUrl = `${siteUrl}/os/dashboard/`;
  const revenueStr =
    s.revenueCents > 0 && s.revenueCurrency ? formatCents(s.revenueCents, s.revenueCurrency, params.language) : '—';

  return [
    c.headline(params.gymName),
    '',
    c.intro,
    '',
    `${c.sessionsLabel}: ${s.sessionsRecorded}`,
    `${c.attendersLabel}: ${s.uniqueAttenders}`,
    `${c.revenueLabel}: ${revenueStr}`,
    `${c.atRiskLabel}: ${s.atRiskCount}`,
    `${c.activeInsightsLabel}: ${s.activeInsights}`,
    '',
    s.topAttender
      ? `${c.topAttenderHeader}: ${c.topAttenderLine(s.topAttender.name, s.topAttender.sessions)}`
      : s.sessionsRecorded === 0
        ? c.noAttendersLine
        : '',
    '',
    `${c.ctaLabel}: ${ctaUrl}`,
    '',
    c.optOutLine,
    '',
    c.sign,
    '',
    `App Store: ${APP_STORE_URL}`,
    `Google Play: ${GOOGLE_PLAY_URL}`,
    `Instagram: ${INSTAGRAM_HANDLE}`,
  ]
    .filter((l) => l !== '')
    .join('\n');
}

export async function sendWeeklySummary(params: WeeklySummaryParams, siteUrl: string): Promise<void> {
  const resend = getResendClient();
  await resend.emails.send({
    from: FROM,
    to: params.ownerEmail,
    subject: copy[params.language].subject(params.gymName),
    html: renderHtml(params, siteUrl),
    text: renderText(params, siteUrl),
  });
}
