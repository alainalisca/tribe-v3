/**
 * POST /api/pase
 * Public. The digital pass at /pase/[slug]: a stranger leaves name, WhatsApp
 * and email, and the partner has the lead in their inbox the same minute.
 *
 * Modelled on /api/tribe-os-waitlist, the repo's other unauthenticated form.
 *
 * Defenses:
 *  - IP rate limit, 5 per 10 minutes.
 *  - Honeypot field + a minimum time on page, both rejected generically.
 *  - Strict validation; the consent sentence is a server constant, never echoed.
 *  - Service-role client: partner_lead_routing is unreachable by anon (172) and
 *    pass_leads gives anon INSERT with no SELECT (173).
 *
 * THE ROW IS THE PRODUCT. The insert happens first and the emails after, with
 * notified_at written only if the partner send resolved. A Resend outage must
 * never cost a lead.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { fetchPassConfig, insertPassLead, markPassLeadNotified, type PassConfig } from '@/lib/dal/passLeads';
import { normalizeWhatsApp, waMeDigits } from '@/lib/pase/phone';
import { generatePassCode } from '@/lib/pase/passCode';
import { consentTextFor } from '@/lib/pase/consent';
import { sendPartnerLeadNotification, sendLeadPassEmail } from '@/lib/email/passLead';

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 600_000;
/** Nobody reads a form, decides, and types three fields in under two seconds. */
const MIN_TIME_ON_PAGE_MS = 2000;
const MAX_CODE_LEN = 40;
const MAX_UA_LEN = 500;
const PASS_CODE_ATTEMPTS = 5;

/** Same check as /api/tribe-os-waitlist, deliberately. */
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * src and code come off the printed QR and are attribution, not input. A
 * malformed one is DROPPED TO NULL AND NEVER REJECTED: the lead is the thing
 * that matters, and losing it because a poster had a typo in its query string
 * would be the wrong trade every time.
 */
function sanitizeTag(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > MAX_CODE_LEN) return null;
  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : null;
}

/**
 * A choice must be one of the values the partner configured, or null. Anything
 * else is discarded rather than stored: pass_options is what the form offered,
 * so a value outside it did not come from the form.
 */
function sanitizeChoice(value: unknown, allowed: string[][]): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return allowed.some((group) => group.includes(trimmed)) ? trimmed : null;
}

/** One shape for every rejection, so probing cannot learn which rule fired. */
function badRequest(): NextResponse {
  return NextResponse.json(
    { error: 'No pudimos procesar tu solicitud. Revisa tus datos e intenta de nuevo.' },
    { status: 400 }
  );
}

/**
 * Not found covers three different states and says so for none of them: no
 * such partner, pass switched off, no routing row. Distinguishing them would
 * let anyone enumerate which partners exist and which are configured.
 */
function notFound(): NextResponse {
  return NextResponse.json({ error: 'Este pase no está disponible.' }, { status: 404 });
}

function buildWhatsappUrl(config: PassConfig, passCode: string): string | null {
  if (!config.leadWhatsapp) return null;
  const digits = waMeDigits(config.leadWhatsapp);
  if (!digits) return null;
  const text = encodeURIComponent(`Hola, tengo el pase ${passCode} de Tribe para mi clase gratis`);
  return `https://wa.me/${digits}?text=${text}`;
}

function buildStorefrontUrl(config: PassConfig, code: string | null): string | null {
  if (!config.storefrontUserId) return null;
  const attribution = code ?? config.slug;
  return `/storefront/${config.storefrontUserId}/?src=pase&code=${encodeURIComponent(attribution)}`;
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const admin = getServiceRoleClient();

    const { allowed } = await checkRateLimit(admin, `pase:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
        { status: 429 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest();
    }
    const raw = body as Record<string, unknown>;

    // Bot checks first: cheapest, and they must not depend on anything below.
    if (typeof raw.website === 'string' && raw.website.trim() !== '') return badRequest();
    const t = typeof raw.t === 'number' ? raw.t : Number(raw.t);
    if (!Number.isFinite(t) || Date.now() - t < MIN_TIME_ON_PAGE_MS) return badRequest();

    if (raw.consent !== true) return badRequest();

    const slug = typeof raw.slug === 'string' ? raw.slug.trim().toLowerCase() : '';
    if (!slug || !/^[a-z0-9-]{1,80}$/.test(slug)) return notFound();

    const config = await fetchPassConfig(admin, slug);
    if (!config) return notFound();

    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (name.length < 2 || name.length > 80) return badRequest();

    const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
    if (!email || email.length > 255 || !isValidEmail(email)) return badRequest();

    const whatsapp = normalizeWhatsApp(typeof raw.whatsapp === 'string' ? raw.whatsapp : '');
    if (!whatsapp) return badRequest();

    const groups = Object.values(config.options);
    const choice1 = sanitizeChoice(raw.choice_1, groups);
    const choice2 = sanitizeChoice(raw.choice_2, groups);
    const src = sanitizeTag(raw.src);
    const code = sanitizeTag(raw.code);

    const userAgent = (request.headers.get('user-agent') ?? '').slice(0, MAX_UA_LEN) || null;
    const consentText = consentTextFor(config.partnerName);

    // Retry on collision rather than checking first: a check-then-insert is a
    // race, and the unique index is the only authority on what is taken.
    let inserted: { id: string; passCode: string } | null = null;
    for (let attempt = 0; attempt < PASS_CODE_ATTEMPTS; attempt++) {
      const passCode = generatePassCode(config.slug);
      const result = await insertPassLead(admin, {
        slug: config.slug,
        partner_id: config.partnerId,
        name,
        whatsapp,
        email,
        choice_1: choice1,
        choice_2: choice2,
        src,
        code,
        pass_code: passCode,
        consent_text: consentText,
        user_agent: userAgent,
      });
      if (result.ok) {
        inserted = { id: result.id, passCode: result.passCode };
        break;
      }
      if (result.reason !== 'duplicate_code') {
        return NextResponse.json({ error: 'No pudimos guardar tu pase. Intenta de nuevo.' }, { status: 500 });
      }
    }
    if (!inserted) {
      logError(new Error('pass_code collided on every attempt'), {
        route: '/api/pase',
        action: 'generate_pass_code',
        slug: config.slug,
      });
      return NextResponse.json({ error: 'No pudimos guardar tu pase. Intenta de nuevo.' }, { status: 500 });
    }

    const whatsappUrl = buildWhatsappUrl(config, inserted.passCode);
    const storefrontUrl = buildStorefrontUrl(config, code);

    // Best effort. The row exists; nothing below may change the response.
    const [partnerSend, leadSend] = await Promise.allSettled([
      sendPartnerLeadNotification({
        to: config.leadEmail,
        cc: config.leadCc,
        partnerName: config.partnerName,
        name,
        whatsapp,
        email,
        choice1,
        choice2,
        passCode: inserted.passCode,
        src,
        code,
        createdAt: new Date(),
      }),
      sendLeadPassEmail({
        to: email,
        name,
        partnerName: config.partnerName,
        address: config.address,
        passCode: inserted.passCode,
        whatsappUrl,
        storefrontUrl,
      }),
    ]);

    // Only the PARTNER send stamps notified_at. The lead's own copy is a
    // courtesy; the partner's is the notification the column is about, and a
    // NULL here is the flag that someone has to chase this lead by hand.
    if (partnerSend.status === 'fulfilled') {
      await markPassLeadNotified(admin, inserted.id);
    } else {
      // The pass_lead id, never the payload: this row is a stranger's phone
      // number and email, and log lines outlive the retention we promised.
      logError(partnerSend.reason, {
        route: '/api/pase',
        action: 'send_partner_notification',
        passLeadId: inserted.id,
      });
    }
    if (leadSend.status === 'rejected') {
      logError(leadSend.reason, {
        route: '/api/pase',
        action: 'send_lead_pass',
        passLeadId: inserted.id,
      });
    }

    return NextResponse.json(
      { pass_code: inserted.passCode, whatsapp_url: whatsappUrl, storefront_url: storefrontUrl },
      { status: 200 }
    );
  } catch (error: unknown) {
    logError(error, { route: '/api/pase', action: 'POST' });
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 });
  }
}
