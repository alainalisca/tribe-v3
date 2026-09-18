import { Resend } from 'resend';
import { waMeDigits } from '@/lib/pase/phone';

/**
 * The two emails a claimed pass sends: one to the partner with the lead, one
 * to the person with their code.
 *
 * Spanish throughout, Colombian register, no em dashes. Both are plain text
 * plus a minimal HTML part -- Leo reads his on a phone and the plain part is
 * what most clients will show him first, so it carries everything.
 */

const FROM = 'Tribe <tribe@aplusfitnessllc.com>';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://tribe-v3.vercel.app';

function getResendClient(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(key);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Bogotá, always. The partner reads this and books against a local clock. */
function bogotaTimestamp(when: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(when);
}

export interface PartnerLeadEmailParams {
  to: string;
  cc: string[];
  partnerName: string;
  name: string;
  whatsapp: string;
  email: string;
  choice1: string | null;
  choice2: string | null;
  passCode: string;
  src: string | null;
  code: string | null;
  createdAt: Date;
}

/**
 * Subject carries the choices when there are any, because Leo triages in his
 * inbox list without opening anything. Both null gives a clean subject rather
 * than an empty "()".
 */
export function partnerSubject(name: string, choice1: string | null, choice2: string | null): string {
  const choices = [choice1, choice2].filter((c): c is string => !!c);
  return choices.length > 0 ? `Nuevo lead de Tribe: ${name} (${choices.join(', ')})` : `Nuevo lead de Tribe: ${name}`;
}

/**
 * To the partner. Reply-To is the LEAD's address, not ours, so hitting reply
 * in any mail client starts a conversation with the person rather than with a
 * Tribe inbox nobody is watching.
 */
export async function sendPartnerLeadNotification(params: PartnerLeadEmailParams): Promise<void> {
  const resend = getResendClient();
  const wa = waMeDigits(params.whatsapp);
  const interes = [params.choice1, params.choice2].filter(Boolean).join(' · ') || 'sin especificar';
  const llego = [params.src, params.code].filter(Boolean).join(' · ') || 'sin datos de origen';

  const text = [
    `${params.name} reclamó su pase de clase gratis en ${params.partnerName}.`,
    '',
    `WhatsApp: ${params.whatsapp}  (https://wa.me/${wa})`,
    `Email: ${params.email}`,
    `Interés: ${interes}`,
    `Pase: ${params.passCode}`,
    `Llegó por: ${llego}`,
    `Fecha: ${bogotaTimestamp(params.createdAt)}`,
    '',
    'Reservó en Tribe: todavía no.',
  ].join('\n');

  const html = [
    `<p><strong>${escapeHtml(params.name)}</strong> reclamó su pase de clase gratis en ${escapeHtml(params.partnerName)}.</p>`,
    '<ul>',
    `<li>WhatsApp: <a href="https://wa.me/${wa}">${escapeHtml(params.whatsapp)}</a></li>`,
    `<li>Email: <a href="mailto:${escapeHtml(params.email)}">${escapeHtml(params.email)}</a></li>`,
    `<li>Interés: ${escapeHtml(interes)}</li>`,
    `<li>Pase: <strong>${escapeHtml(params.passCode)}</strong></li>`,
    `<li>Llegó por: ${escapeHtml(llego)}</li>`,
    `<li>Fecha: ${escapeHtml(bogotaTimestamp(params.createdAt))}</li>`,
    '</ul>',
    '<p>Reservó en Tribe: todavía no.</p>',
  ].join('');

  await resend.emails.send({
    from: FROM,
    to: params.to,
    cc: params.cc.length > 0 ? params.cc : undefined,
    replyTo: params.email,
    subject: partnerSubject(params.name, params.choice1, params.choice2),
    text,
    html,
  });
}

export interface LeadPassEmailParams {
  to: string;
  name: string;
  partnerName: string;
  address: string | null;
  passCode: string;
  whatsappUrl: string | null;
  storefrontUrl: string | null;
}

/** To the person: their code, where to use it, and what happens next. */
export async function sendLeadPassEmail(params: LeadPassEmailParams): Promise<void> {
  const resend = getResendClient();
  const storefront = params.storefrontUrl ? `${SITE_URL}${params.storefrontUrl}` : null;

  const text = [
    `Hola ${params.name},`,
    '',
    `Este es tu pase para una clase gratis en ${params.partnerName}.`,
    '',
    `Tu código: ${params.passCode}`,
    'Muéstralo en recepción o menciónalo por WhatsApp.',
    ...(params.address ? ['', `Dónde: ${params.address}`] : []),
    ...(params.whatsappUrl ? ['', `Escríbele a ${params.partnerName}: ${params.whatsappUrl}`] : []),
    ...(storefront ? [`Reserva tu clase en Tribe: ${storefront}`] : []),
    '',
    `${params.partnerName} te va a escribir para agendar tu clase.`,
    '',
    'Tribe',
  ].join('\n');

  const html = [
    `<p>Hola ${escapeHtml(params.name)},</p>`,
    `<p>Este es tu pase para una clase gratis en ${escapeHtml(params.partnerName)}.</p>`,
    `<p style="font-size:28px;font-weight:700;letter-spacing:2px;">${escapeHtml(params.passCode)}</p>`,
    '<p>Muéstralo en recepción o menciónalo por WhatsApp.</p>',
    params.address ? `<p>Dónde: ${escapeHtml(params.address)}</p>` : '',
    params.whatsappUrl
      ? `<p><a href="${escapeHtml(params.whatsappUrl)}">Escríbele a ${escapeHtml(params.partnerName)} por WhatsApp</a></p>`
      : '',
    storefront ? `<p><a href="${escapeHtml(storefront)}">Reserva tu clase en Tribe</a></p>` : '',
    `<p>${escapeHtml(params.partnerName)} te va a escribir para agendar tu clase.</p>`,
    '<p>Tribe</p>',
  ].join('');

  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `Tu pase ${params.passCode} para ${params.partnerName}`,
    text,
    html,
  });
}
