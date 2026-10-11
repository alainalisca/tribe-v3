import { weekLabel, formatClassSlot, type WeekRange, type ClassSlot } from './helpers';
import { formatCents, type Currency, type FormatLanguage } from '@/lib/format/currency';

interface WeeklyNumbers {
  visits: number;
  visits_pct: number | null;
  active_members: number;
  new_members: number;
  touches: number;
  came_back: number;
  recovered_cents: number;
  at_risk_cents: number;
}

interface CameBackMember {
  name: string | null;
  channel: string;
  days: number;
  monthlyValueCents: number | null;
}

interface ExpiringPlan {
  name: string | null;
  plan: string | null;
  planEndsOn: string;
  expiryLabel: string;
  expiryLabelEn: string;
  monthlyValueCents: number | null;
}

interface ContactMember {
  name: string | null;
  daysSinceLastActivity: number | null;
  plan: string | null;
}

export interface WeeklyEmailData {
  week: WeekRange;
  currency: string;
  numbers: WeeklyNumbers;
  came_back_members: CameBackMember[];
  expiring_plans: ExpiringPlan[];
  to_contact: ContactMember[];
  classes: { fullest: ClassSlot | null; emptiest: ClassSlot | null };
}

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  call: 'Llamada',
  in_person: 'En persona',
  other: 'Otro',
};

const CHANNEL_LABELS_EN: Record<string, string> = {
  whatsapp: 'WhatsApp',
  call: 'Call',
  in_person: 'In person',
  other: 'Other',
};

function fmtMoney(cents: number, currency: string, lang: FormatLanguage): string {
  return formatCents(cents, currency as Currency, lang);
}

export function renderWeeklyEmail(data: WeeklyEmailData, lang: 'en' | 'es' = 'es'): string {
  const title = weekLabel(data.week, lang);
  const n = data.numbers;
  const channelMap = lang === 'es' ? CHANNEL_LABELS : CHANNEL_LABELS_EN;

  const visitsPct = n.visits_pct !== null
    ? ` (${n.visits_pct > 0 ? '+' : ''}${n.visits_pct}%)`
    : '';

  const dLabel = (n: number) => lang === 'es'
    ? (n === 1 ? 'día' : 'días')
    : (n === 1 ? 'day' : 'days');

  const rows = [
    { label: lang === 'es' ? 'Visitas' : 'Visits', value: `${n.visits}${visitsPct}` },
    { label: lang === 'es' ? 'Miembros activos' : 'Active members', value: String(n.active_members) },
    { label: lang === 'es' ? 'Nuevos' : 'New', value: String(n.new_members) },
    { label: lang === 'es' ? 'Contactos hechos' : 'Contacts made', value: String(n.touches) },
    { label: lang === 'es' ? 'Volvieron' : 'Came back', value: String(n.came_back) },
    { label: lang === 'es' ? 'Dinero recuperado' : 'Recovered', value: fmtMoney(n.recovered_cents, data.currency, lang) },
    { label: lang === 'es' ? 'Dinero en riesgo hoy' : 'At risk today', value: fmtMoney(n.at_risk_cents, data.currency, lang) },
  ];

  const numbersHtml = rows
    .map(
      (r) =>
        `<tr><td style="padding:6px 12px;font-size:14px;color:#374151;">${r.label}</td>` +
        `<td style="padding:6px 12px;font-size:14px;font-weight:700;color:#232A31;text-align:right;">${r.value}</td></tr>`,
    )
    .join('\n');

  const cameBackHtml =
    data.came_back_members.length === 0
      ? `<p style="font-size:13px;color:#9CA3AF;padding:8px 0;">${lang === 'es' ? 'Ninguno esta semana.' : 'None this week.'}</p>`
      : data.came_back_members
          .map(
            (m) =>
              `<tr><td style="padding:4px 12px;font-size:13px;color:#374151;">${m.name ?? (lang === 'es' ? 'Sin nombre' : 'No name')}</td>` +
              `<td style="padding:4px 12px;font-size:13px;color:#6B7280;">${channelMap[m.channel] ?? m.channel}</td>` +
              `<td style="padding:4px 12px;font-size:13px;color:#6B7280;text-align:right;">${m.days} ${dLabel(m.days)}</td>` +
              `<td style="padding:4px 12px;font-size:13px;color:#6B7280;text-align:right;">${m.monthlyValueCents ? fmtMoney(m.monthlyValueCents, data.currency, lang) : ''}</td></tr>`,
          )
          .join('\n');

  const expiringHtml =
    data.expiring_plans.length === 0
      ? `<p style="font-size:13px;color:#9CA3AF;padding:8px 0;">${lang === 'es' ? 'Ninguno esta semana.' : 'None this week.'}</p>`
      : data.expiring_plans
          .map(
            (m) =>
              `<tr><td style="padding:4px 12px;font-size:13px;color:#374151;">${m.name ?? ''}</td>` +
              `<td style="padding:4px 12px;font-size:13px;color:#6B7280;">${m.plan ?? ''}</td>` +
              `<td style="padding:4px 12px;font-size:13px;color:#6B7280;text-align:right;">${lang === 'es' ? m.expiryLabel : m.expiryLabelEn}</td></tr>`,
          )
          .join('\n');

  const contactHtml =
    data.to_contact.length === 0
      ? `<p style="font-size:13px;color:#9CA3AF;padding:8px 0;">${lang === 'es' ? 'Ninguno esta semana.' : 'None this week.'}</p>`
      : data.to_contact
          .map(
            (m) =>
              `<tr><td style="padding:4px 12px;font-size:13px;color:#374151;">${m.name ?? (lang === 'es' ? 'Sin nombre' : 'No name')}</td>` +
              `<td style="padding:4px 12px;font-size:13px;color:#6B7280;text-align:right;">${m.daysSinceLastActivity !== null ? `${m.daysSinceLastActivity} ${dLabel(m.daysSinceLastActivity)}` : ''}</td>` +
              `<td style="padding:4px 12px;font-size:13px;color:#6B7280;text-align:right;">${m.plan ?? ''}</td></tr>`,
          )
          .join('\n');

  const classesHtml =
    data.classes.fullest
      ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr><td style="padding:4px 12px;font-size:13px;color:#374151;">${lang === 'es' ? 'Más llena' : 'Fullest'}</td>
          <td style="padding:4px 12px;font-size:13px;color:#232A31;font-weight:600;">${formatClassSlot(data.classes.fullest, lang)}</td></tr>
          ${data.classes.emptiest ? `<tr><td style="padding:4px 12px;font-size:13px;color:#374151;">${lang === 'es' ? 'Más vacía' : 'Emptiest'}</td>
          <td style="padding:4px 12px;font-size:13px;color:#232A31;font-weight:600;">${formatClassSlot(data.classes.emptiest, lang)}</td></tr>` : ''}
        </table>`
      : `<p style="font-size:13px;color:#9CA3AF;padding:8px 0;">${lang === 'es' ? 'Sin datos.' : 'No data.'}</p>`;

  const baseUrl = typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SITE_URL
    ? process.env.NEXT_PUBLIC_SITE_URL
    : 'http://localhost:3002';
  const buttonUrl = `${baseUrl}/os/retention`;
  const buttonLabel = lang === 'es' ? 'Abrir Tribe.OS' : 'Open Tribe.OS';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;">
<tr><td align="center" style="padding:24px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;overflow:hidden;max-width:600px;">
  <tr><td style="background:#232A31;padding:20px 24px;">
    <h1 style="margin:0;font-size:20px;color:#B2E269;font-weight:700;">Tribe.OS</h1>
    <p style="margin:4px 0 0;font-size:14px;color:#D1D5DB;">${title}</p>
  </td></tr>
  <tr><td style="padding:20px 24px;">
    <h2 style="margin:0 0 12px;font-size:16px;color:#232A31;">${lang === 'es' ? 'Números de la semana' : 'Weekly numbers'}</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #E5E7EB;border-radius:8px;">
      ${numbersHtml}
    </table>
  </td></tr>
  <tr><td style="padding:0 24px 20px;">
    <h2 style="margin:0 0 12px;font-size:16px;color:#232A31;">${lang === 'es' ? 'Volvieron gracias a ti' : 'Came back thanks to you'}</h2>
    ${data.came_back_members.length > 0 ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #E5E7EB;border-radius:8px;">${cameBackHtml}</table>` : cameBackHtml}
  </td></tr>
  <tr><td style="padding:0 24px 20px;">
    <h2 style="margin:0 0 12px;font-size:16px;color:#232A31;">${lang === 'es' ? 'Para contactar esta semana' : 'Contact this week'}</h2>
    ${data.to_contact.length > 0 ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #E5E7EB;border-radius:8px;">${contactHtml}</table>` : contactHtml}
  </td></tr>
  <tr><td style="padding:0 24px 20px;">
    <h2 style="margin:0 0 12px;font-size:16px;color:#232A31;">${lang === 'es' ? 'Planes por vencer' : 'Expiring plans'}</h2>
    ${data.expiring_plans.length > 0 ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #E5E7EB;border-radius:8px;">${expiringHtml}</table>` : expiringHtml}
  </td></tr>
  <tr><td style="padding:0 24px 20px;">
    <h2 style="margin:0 0 12px;font-size:16px;color:#232A31;">${lang === 'es' ? 'Clases de la semana' : 'Classes this week'}</h2>
    ${classesHtml}
  </td></tr>
  <tr><td style="padding:0 24px 20px;" align="center">
    <a href="${buttonUrl}" style="display:inline-block;padding:12px 28px;background:#B2E269;color:#232A31;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;">${buttonLabel}</a>
  </td></tr>
  <tr><td style="background:#F9FAFB;padding:16px 24px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9CA3AF;">Tribe.OS</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
