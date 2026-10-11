import { weekLabel, type WeekRange } from './helpers';

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
  monthlyValueCents: number | null;
}

interface ClassInfo {
  className: string;
  visits: number;
  day: string;
  hour: number;
}

export interface WeeklyEmailData {
  week: WeekRange;
  currency: string;
  numbers: WeeklyNumbers;
  came_back_members: CameBackMember[];
  expiring_plans: ExpiringPlan[];
  classes: { fullest: ClassInfo | null; emptiest: ClassInfo | null };
}

function formatCentsEmail(cents: number, currency: string): string {
  if (currency === 'COP') {
    return `$${Math.round(cents / 100).toLocaleString('es-CO')} COP`;
  }
  return `$${(cents / 100).toFixed(2)} ${currency}`;
}

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  call: 'Llamada',
  in_person: 'En persona',
  other: 'Otro',
};

export function renderWeeklyEmail(data: WeeklyEmailData, lang: 'en' | 'es' = 'es'): string {
  const title = weekLabel(data.week, lang);
  const n = data.numbers;

  const visitsPct = n.visits_pct !== null
    ? ` (${n.visits_pct > 0 ? '+' : ''}${n.visits_pct}%)`
    : '';

  const rows = [
    { label: lang === 'es' ? 'Visitas' : 'Visits', value: `${n.visits}${visitsPct}` },
    { label: lang === 'es' ? 'Miembros activos' : 'Active members', value: String(n.active_members) },
    { label: lang === 'es' ? 'Nuevos' : 'New', value: String(n.new_members) },
    { label: lang === 'es' ? 'Contactos hechos' : 'Contacts made', value: String(n.touches) },
    { label: lang === 'es' ? 'Volvieron' : 'Came back', value: String(n.came_back) },
    { label: lang === 'es' ? 'Dinero recuperado' : 'Recovered', value: formatCentsEmail(n.recovered_cents, data.currency) },
    { label: lang === 'es' ? 'Dinero en riesgo hoy' : 'At risk today', value: formatCentsEmail(n.at_risk_cents, data.currency) },
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
              `<td style="padding:4px 12px;font-size:13px;color:#6B7280;">${CHANNEL_LABELS[m.channel] ?? m.channel}</td>` +
              `<td style="padding:4px 12px;font-size:13px;color:#6B7280;text-align:right;">${m.days}d</td>` +
              `<td style="padding:4px 12px;font-size:13px;color:#6B7280;text-align:right;">${m.monthlyValueCents ? formatCentsEmail(m.monthlyValueCents, data.currency) : ''}</td></tr>`,
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
              `<td style="padding:4px 12px;font-size:13px;color:#6B7280;text-align:right;">${m.planEndsOn}</td></tr>`,
          )
          .join('\n');

  const classesHtml =
    data.classes.fullest
      ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr><td style="padding:4px 12px;font-size:13px;color:#374151;">${lang === 'es' ? 'Mas llena' : 'Fullest'}</td>
          <td style="padding:4px 12px;font-size:13px;color:#232A31;font-weight:600;">${data.classes.fullest.className} (${data.classes.fullest.visits})</td></tr>
          ${data.classes.emptiest ? `<tr><td style="padding:4px 12px;font-size:13px;color:#374151;">${lang === 'es' ? 'Mas vacia' : 'Emptiest'}</td>
          <td style="padding:4px 12px;font-size:13px;color:#232A31;font-weight:600;">${data.classes.emptiest.className} (${data.classes.emptiest.visits})</td></tr>` : ''}
        </table>`
      : `<p style="font-size:13px;color:#9CA3AF;padding:8px 0;">${lang === 'es' ? 'Sin datos.' : 'No data.'}</p>`;

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
    <h2 style="margin:0 0 12px;font-size:16px;color:#232A31;">${lang === 'es' ? 'Numeros de la semana' : 'Weekly numbers'}</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #E5E7EB;border-radius:8px;">
      ${numbersHtml}
    </table>
  </td></tr>
  <tr><td style="padding:0 24px 20px;">
    <h2 style="margin:0 0 12px;font-size:16px;color:#232A31;">${lang === 'es' ? 'Volvieron gracias a ti' : 'Came back thanks to you'}</h2>
    ${data.came_back_members.length > 0 ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #E5E7EB;border-radius:8px;">${cameBackHtml}</table>` : cameBackHtml}
  </td></tr>
  <tr><td style="padding:0 24px 20px;">
    <h2 style="margin:0 0 12px;font-size:16px;color:#232A31;">${lang === 'es' ? 'Planes por vencer' : 'Expiring plans'}</h2>
    ${data.expiring_plans.length > 0 ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #E5E7EB;border-radius:8px;">${expiringHtml}</table>` : expiringHtml}
  </td></tr>
  <tr><td style="padding:0 24px 20px;">
    <h2 style="margin:0 0 12px;font-size:16px;color:#232A31;">${lang === 'es' ? 'Clases de la semana' : 'Classes this week'}</h2>
    ${classesHtml}
  </td></tr>
  <tr><td style="background:#F9FAFB;padding:16px 24px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9CA3AF;">Tribe.OS by A+ Fitness LLC</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
