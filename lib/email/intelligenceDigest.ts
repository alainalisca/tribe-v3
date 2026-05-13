/**
 * Bilingual intelligence digest email.
 *
 * Sent from the nightly intelligence cron after a gym's scoring run
 * generates new community_insights. Closes the AI loop: the engine
 * produces signals, but signals are useless if the coach doesn't see
 * them. The dashboard banner catches them when they're logged in;
 * this email catches them when they're not.
 *
 * Companion to lib/email/tribeOsBetaWelcome.ts — same sender, same
 * brand styling, same bilingual structure. Reuses the app-store /
 * instagram links from lib/email/tribeOsWaitlist.ts for the footer.
 *
 * Volume: one email per gym per night, only when at least one
 * insight was created in that run. The dedupe step in
 * lib/ai/insight-generator.ts already prevents re-emailing about a
 * member who's already covered by an open insight — so this stays
 * quiet on steady-state gyms and only fires when something genuinely
 * changes.
 *
 * Cap: digest shows the first N insights inline; anything beyond
 * gets a "+N more" link to /os/intelligence. Keeps the email
 * scannable even on a gym with a flood of new at-risk members.
 *
 * Spanish copy is pending Verónica's review.
 */

import { Resend } from 'resend';
import { APP_STORE_URL, GOOGLE_PLAY_URL, INSTAGRAM_HANDLE } from './tribeOsWaitlist';
import { renderTemplate, extractTemplate } from '@/lib/ai/insight-templates';

const FROM = 'Tribe <tribe@aplusfitnessllc.com>';
const INLINE_INSIGHT_CAP = 8;

export interface DigestInsight {
  id: string;
  type: 'CHURN_RISK' | 'RETENTION_OPP' | 'REVENUE' | 'GROWTH';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /** Persisted English headline — fallback when no template is set. */
  headline: string;
  /** Persisted English body — fallback when no template is set. */
  body: string;
  /** May carry an i18n template under .template that the email renders in the recipient's language. */
  data_payload: unknown;
  /** Subject of the insight when there's one clear member. Drives email-row member name. */
  primary_member_name: string | null;
  primary_member_id: string | null;
}

export interface DigestParams {
  /** Owner's display name. Lands in the greeting. */
  ownerName: string;
  /** Owner's email — recipient. */
  ownerEmail: string;
  /** Owner's preferred_language. Drives copy + insight template language. */
  language: 'en' | 'es';
  /** Display name of the gym. Lands in subject + body. */
  gymName: string;
  /** Full list of new insights to summarize. Caller decides freshness. */
  insights: DigestInsight[];
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
    subjectFor: (n: number, gymName: string) =>
      n === 1 ? `1 new alert for ${gymName}` : `${n} new alerts for ${gymName}`,
    eyebrow: 'Tribe.OS · Intelligence',
    headlineFor: (n: number) =>
      n === 1 ? '1 new alert needs your attention.' : `${n} new alerts need your attention.`,
    intro:
      'Our nightly intelligence run flagged these clients. A short check-in within 48 hours is the highest-leverage move on a flagged member — they want to be remembered.',
    severityLabel: { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' } as const,
    typeLabel: {
      CHURN_RISK: 'Churn risk',
      RETENTION_OPP: 'Retention opportunity',
      REVENUE: 'Revenue signal',
      GROWTH: 'Growth signal',
    } as const,
    overflow: (n: number) => `+ ${n} more in your Intelligence feed`,
    ctaLabel: 'Open Intelligence',
    closing:
      'If a flagged member shouldn’t be on the list, dismiss the card from the Intelligence page — we won’t resurface them.',
    optOutLine: 'You can turn these emails off in /os/gym settings.',
    sign: 'Alain\nA Plus Fitness LLC',
    appStoreLabel: 'App Store',
    googlePlayLabel: 'Google Play',
    instagramLabel: 'Instagram',
  },
  es: {
    subjectFor: (n: number, gymName: string) =>
      n === 1 ? `1 nueva alerta para ${gymName}` : `${n} nuevas alertas para ${gymName}`,
    eyebrow: 'Tribe.OS · Inteligencia',
    headlineFor: (n: number) =>
      n === 1 ? '1 nueva alerta necesita tu atención.' : `${n} nuevas alertas necesitan tu atención.`,
    intro:
      'Nuestro análisis nocturno marcó a estos clientes. Un mensaje breve en las próximas 48 horas es la acción de mayor impacto — quieren ser recordados.',
    severityLabel: { CRITICAL: 'Crítico', HIGH: 'Alto', MEDIUM: 'Medio', LOW: 'Bajo' } as const,
    typeLabel: {
      CHURN_RISK: 'Riesgo de abandono',
      RETENTION_OPP: 'Oportunidad de retención',
      REVENUE: 'Señal de ingresos',
      GROWTH: 'Señal de crecimiento',
    } as const,
    overflow: (n: number) => `+ ${n} más en tu feed de Inteligencia`,
    ctaLabel: 'Abrir Inteligencia',
    closing:
      'Si un miembro marcado no debería estar en la lista, descarta la tarjeta desde Inteligencia — no volverá a aparecer.',
    optOutLine: 'Puedes desactivar estos correos desde la configuración en /os/gym.',
    sign: 'Alain\nA Plus Fitness LLC',
    appStoreLabel: 'App Store',
    googlePlayLabel: 'Google Play',
    instagramLabel: 'Instagram',
  },
} as const;

// Severity → hex color for the inline rail on each row. Matches the
// brand palette used on /os/intelligence so the email reads as part
// of the same product.
const SEVERITY_HEX: Record<DigestInsight['severity'], string> = {
  CRITICAL: '#E5484D',
  HIGH: '#F5A524',
  MEDIUM: '#3B82F6',
  LOW: '#6B7280',
};

/**
 * Resolve the headline for a single insight in the recipient's language.
 * Prefers the embedded template from data_payload; falls back to the
 * persisted English headline when no template is available (older
 * insights generated before the templates layer landed).
 */
function localizedHeadline(insight: DigestInsight, language: 'en' | 'es'): string {
  const template = extractTemplate(insight.data_payload, 'headline');
  if (template) {
    const rendered = renderTemplate(template, language);
    if (rendered) return rendered;
  }
  return insight.headline;
}

function localizedBody(insight: DigestInsight, language: 'en' | 'es'): string {
  const template = extractTemplate(insight.data_payload, 'body');
  if (template) {
    const rendered = renderTemplate(template, language);
    if (rendered) return rendered;
  }
  return insight.body;
}

function renderDigestHtml(params: DigestParams, siteUrl: string): string {
  const c = copy[params.language];
  const total = params.insights.length;
  const inlineInsights = params.insights.slice(0, INLINE_INSIGHT_CAP);
  const overflowCount = Math.max(0, total - inlineInsights.length);
  const ctaUrl = `${siteUrl}/os/intelligence/`;

  const insightRowsHtml = inlineInsights
    .map((insight) => {
      const rail = SEVERITY_HEX[insight.severity];
      const headline = escapeHtml(localizedHeadline(insight, params.language));
      const body = escapeHtml(localizedBody(insight, params.language));
      const sevPill = `<span style="display: inline-block; padding: 2px 8px; background: ${rail}; color: white; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; border-radius: 999px;">${escapeHtml(c.severityLabel[insight.severity])}</span>`;
      const typePill = `<span style="display: inline-block; padding: 2px 8px; background: #f3f4f6; color: #4b5563; font-size: 11px; font-weight: 600; border-radius: 999px;">${escapeHtml(c.typeLabel[insight.type])}</span>`;
      // Per-row click-through: prefer the member detail when there's
      // a single subject, fall back to the Intelligence feed.
      const rowHref = insight.primary_member_id ? `${siteUrl}/os/clients/${insight.primary_member_id}/` : ctaUrl;
      return `
        <a href="${rowHref}" style="display: block; margin: 0 0 12px; padding: 14px 16px 14px 18px; border: 1px solid #e5e7eb; border-left: 4px solid ${rail}; border-radius: 10px; background: #ffffff; text-decoration: none; color: inherit;">
          <div style="margin: 0 0 6px;">${sevPill} ${typePill}</div>
          <h3 style="margin: 0 0 4px; font-size: 15px; font-weight: 700; color: #111827; line-height: 1.35;">${headline}</h3>
          <p style="margin: 0; font-size: 13px; line-height: 1.55; color: #4b5563;">${body}</p>
        </a>
      `;
    })
    .join('');

  const overflowHtml =
    overflowCount > 0
      ? `<p style="margin: 4px 0 18px; font-size: 13px; color: #6b7280; text-align: center;"><a href="${ctaUrl}" style="color: #4b5563; text-decoration: none; font-weight: 600;">${escapeHtml(c.overflow(overflowCount))} →</a></p>`
      : '';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f9fafb; padding: 24px;">
      <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.08);">
        <div style="background: #272D34; padding: 28px 28px 22px;">
          <div style="font-size: 26px; font-weight: 900; color: white; line-height: 1; letter-spacing: -0.02em; margin: 0 0 22px;">Tribe<span style="color: #9EE551;">.</span></div>
          <p style="margin: 0; color: #9EE551; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600;">${escapeHtml(c.eyebrow)}</p>
          <h1 style="margin: 8px 0 0; color: white; font-size: 22px; font-weight: 800; line-height: 1.25;">${escapeHtml(c.headlineFor(total))}</h1>
        </div>
        <div style="padding: 26px 28px 12px;">
          <p style="margin: 0 0 22px; font-size: 14px; line-height: 1.6; color: #1f2937;">${escapeHtml(c.intro)}</p>
          ${insightRowsHtml}
          ${overflowHtml}
          <div style="text-align: center; margin: 18px 0 6px;">
            <a href="${ctaUrl}" style="display: inline-block; font-size: 14px; font-weight: 700; color: #272D34; background: #9EE551; padding: 12px 22px; border-radius: 999px; text-decoration: none;">${escapeHtml(c.ctaLabel)} →</a>
          </div>
          <p style="margin: 22px 0 6px; font-size: 13px; line-height: 1.55; color: #6b7280;">${escapeHtml(c.closing)}</p>
          <p style="margin: 0 0 22px; font-size: 12px; color: #9ca3af;">${escapeHtml(c.optOutLine)}</p>
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

function renderDigestText(params: DigestParams, siteUrl: string): string {
  const c = copy[params.language];
  const total = params.insights.length;
  const inlineInsights = params.insights.slice(0, INLINE_INSIGHT_CAP);
  const overflowCount = Math.max(0, total - inlineInsights.length);
  const ctaUrl = `${siteUrl}/os/intelligence/`;

  const insightLines = inlineInsights
    .map((insight) => {
      const headline = localizedHeadline(insight, params.language);
      const body = localizedBody(insight, params.language);
      const sev = c.severityLabel[insight.severity];
      const typ = c.typeLabel[insight.type];
      const rowHref = insight.primary_member_id ? `${siteUrl}/os/clients/${insight.primary_member_id}/` : ctaUrl;
      return `[${sev} · ${typ}] ${headline}\n  ${body}\n  ${rowHref}`;
    })
    .join('\n\n');

  return [
    c.headlineFor(total),
    '',
    c.intro,
    '',
    insightLines,
    '',
    overflowCount > 0 ? `${c.overflow(overflowCount)}: ${ctaUrl}` : null,
    overflowCount > 0 ? '' : null,
    `${c.ctaLabel}: ${ctaUrl}`,
    '',
    c.closing,
    c.optOutLine,
    '',
    c.sign,
    '',
    `App Store: ${APP_STORE_URL}`,
    `Google Play: ${GOOGLE_PLAY_URL}`,
    `Instagram: ${INSTAGRAM_HANDLE}`,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

/**
 * Send the digest. Throws on Resend error so the caller can decide
 * whether to fail the cron iteration or log-and-continue. The cron
 * wraps this in try/catch and continues so one gym's email failure
 * doesn't break the whole nightly run.
 *
 * Caller is expected to have already filtered by the per-gym
 * `intelligence_email_enabled` flag — this function doesn't re-check.
 */
export async function sendIntelligenceDigest(params: DigestParams, siteUrl: string): Promise<void> {
  // Empty digest is a no-op. Cleaner than asking every caller to
  // gate on length first.
  if (params.insights.length === 0) return;

  const resend = getResendClient();
  await resend.emails.send({
    from: FROM,
    to: params.ownerEmail,
    subject: copy[params.language].subjectFor(params.insights.length, params.gymName),
    html: renderDigestHtml(params, siteUrl),
    text: renderDigestText(params, siteUrl),
  });
}
