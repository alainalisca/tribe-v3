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
 * ATHLETE ATTRIBUTION (T-AV23): flag off changes nothing here, no query, no
 * column, no response key (route.flagoff.test.ts). Flag on: see
 * lib/pase/athleteAttribution.ts. The ledger, not this route, decides credit.
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
import { resolveAthleteAttribution, consentForAttribution, renderVoucherQr } from '@/lib/pase/athleteAttribution';
import { sendPartnerLeadNotification, sendLeadPassEmail } from '@/lib/email/passLead';
import { claimLeadNotification } from '@/lib/dal/athleteNotify';
import { publicOrigin } from '@/lib/http/publicOrigin';
import { deliverNotifications } from '@/lib/atletas/athleteNotifications';
import {
  sanitizeTag,
  sanitizeLandingPath,
  sanitizeAttributionObject,
  isCapturablePath,
  isAuthPath,
} from '@/lib/attribution';

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 600_000;
/** Nobody reads a form, decides, and types three fields in under two seconds. */
const MIN_TIME_ON_PAGE_MS = 2000;
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
 *
 * THE SANITIZER NOW LIVES IN lib/attribution.ts AND IS IMPORTED (T-GROW1).
 *
 * This file had its own copy, with its own `MAX_CODE_LEN = 40`. Two things made
 * that worth removing rather than leaving alone:
 *
 *   1. Migrations 211 and 213 bound these columns at 40 characters, and a CHECK
 *      binds the service role -- which is what this route is. So the route's limit
 *      and the SQL limit are one number, and a disagreement does not produce a
 *      truncated field, it produces a 23514 and LOSES THE LEAD.
 *      lib/attribution.limits.test.ts parses the migrations and fails on drift,
 *      and it also fails if this file declares a limit of its own again.
 *   2. The capture library has to apply the identical rule, because a value that
 *      came from localStorage reaches this insert the same way a URL parameter
 *      does. Two copies of one rule is the defect CLAUDE.md records five times
 *      over, most recently as three hand-kept copies of one comment stripper.
 *
 * ONE BEHAVIOUR CHANGE, and it is deliberate: the shared sanitizer lowercases
 * `src` and the utm_* and uppercases `code` and `ref`. Before, values were stored
 * as typed, so `Instagram` and `instagram` were two channels in any grouping, and
 * one channel reported as two rows that each look too small to act on. The only
 * live consumer affected is resolveAthleteAttribution's `src !== 'atleta'` check,
 * which now also matches `Atleta` -- strictly more leads credited, none fewer.
 * Its REF_CODE_SHAPE already accepted either case and findActiveAthleteByRefCode
 * already uppercased, so uppercasing `code` earlier changes nothing there.
 */

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

/**
 * Two shapes of 400, and the split is deliberate.
 *
 * A VALIDATION failure is about something the person typed, and they can only
 * fix it if we say which field and why. The first live test on the preview
 * typed a US number, got one unplaced generic banner, and had no way to know
 * what the form wanted.
 *
 * A BOT check failure is not about the person at all. Honeypot, timing and the
 * rate limit keep one flat message, because naming the rule that fired tells a
 * script exactly what to change.
 */
const FIELD_MESSAGES = {
  name: 'Escribe tu nombre completo.',
  email: 'Escribe un correo válido.',
  whatsapp: 'Escribe tu número con código de país, por ejemplo +57 300 123 4567 o +1 347 213 2947.',
  consent: 'Necesitamos tu autorización para compartir tus datos con el aliado.',
} as const;

type ErrorField = keyof typeof FIELD_MESSAGES;

function fieldError(field: ErrorField): NextResponse {
  return NextResponse.json({ field, message: FIELD_MESSAGES[field] }, { status: 400 });
}

/** Bot checks and malformed bodies. Says nothing about which rule fired. */
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

    if (raw.consent !== true) return fieldError('consent');

    const slug = typeof raw.slug === 'string' ? raw.slug.trim().toLowerCase() : '';
    if (!slug || !/^[a-z0-9-]{1,80}$/.test(slug)) return notFound();

    const config = await fetchPassConfig(admin, slug);
    if (!config) return notFound();

    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (name.length < 2 || name.length > 80) return fieldError('name');

    const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
    if (!email || email.length > 255 || !isValidEmail(email)) return fieldError('email');

    const whatsapp = normalizeWhatsApp(typeof raw.whatsapp === 'string' ? raw.whatsapp : '');
    if (!whatsapp) return fieldError('whatsapp');

    const groups = Object.values(config.options);
    const choice1 = sanitizeChoice(raw.choice_1, groups);
    const choice2 = sanitizeChoice(raw.choice_2, groups);
    const src = sanitizeTag(raw.src, 'src');
    const code = sanitizeTag(raw.code, 'code');

    /**
     * T-GROW1 part B: the rest of the attribution.
     *
     * EVERY FIELD IS OPTIONAL AND EVERY FAILURE IS A NULL. The client sends these
     * from lib/attribution.ts, which has already sanitized them -- so this pass is
     * not redundant, it is the only one that counts. The body of an unauthenticated
     * POST is whatever the sender chose to put in it, and these seven values flow
     * into columns the database bounds with CHECKs; a value that slipped past here
     * would abort the insert and cost the lead rather than the field.
     *
     * first_touch is revalidated field by field rather than stored as received,
     * for the same reason, and because it is the one jsonb column on this table:
     * without the shape and size check it is an unbounded write target reachable
     * from a public endpoint.
     */
    /**
     * RULE A AND B, SERVER SIDE. See lib/attribution.ts for the incident.
     *
     * A lead's landing_path of /auth/callback/ is dropped rather than refused,
     * which is the opposite of /api/attr's choice and deliberate: there, the
     * whole row is the visit and a bad landing page makes it meaningless, while
     * here the row is a PERSON WHO LEFT THEIR PHONE NUMBER. 173's rule holds --
     * never lose a lead over a query-string problem -- so the field goes to NULL
     * and the lead is saved.
     */
    const rawLanding = sanitizeLandingPath(raw.landing_path);
    const landingPath = isCapturablePath(rawLanding) ? rawLanding : null;
    const onAuth = isAuthPath(landingPath);

    const attrRef = sanitizeTag(raw.ref, 'ref');
    const utmSource = sanitizeTag(raw.utm_source, 'utm_source');
    const utmMedium = sanitizeTag(raw.utm_medium, 'utm_medium');
    const utmCampaign = sanitizeTag(raw.utm_campaign, 'utm_campaign');
    const utmContent = sanitizeTag(raw.utm_content, 'utm_content');
    // sanitizeAttributionObject applies the same two rules to the nested object,
    // so a first_touch captured on the callback is refused whole. That is the
    // blob TR-C3LU carried into production.
    const firstTouch = sanitizeAttributionObject(raw.first_touch);

    const userAgent = (request.headers.get('user-agent') ?? '').slice(0, MAX_UA_LEN) || null;
    const attribution = await resolveAthleteAttribution(admin, config.partnerId, src, code);
    const { consentText, referredByAthleteId, invitedByFirstName, overLimit } = consentForAttribution(
      config.partnerName,
      attribution
    );
    if (overLimit) {
      logError(new Error('attributed consent_text exceeds 500 characters; saved without attribution'), {
        route: '/api/pase',
        action: 'athlete_attribution',
        slug: config.slug,
      });
    }

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
        code: onAuth ? null : code,
        pass_code: passCode,
        consent_text: consentText,
        user_agent: userAgent,
        // T-GROW1 part B. Named individually and never spread from the body:
        // mass assignment into a table whose other columns include attended_at,
        // outcome and bonus_eligible is the one mistake that cannot be allowed
        // here, and the restrictive policies from 204, 208 and 211 only bind the
        // CLIENT roles -- this insert runs as the service role and bypasses all of
        // them. The explicit list IS the gate on this path.
        attr_ref: attrRef,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        utm_content: utmContent,
        landing_path: landingPath,
        first_touch: firstTouch,
        ...(referredByAthleteId ? { referred_by_athlete_id: referredByAthleteId } : {}),
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
        utmCampaign: utmCampaign,
        createdAt: new Date(),
        // T-AV27b: only for an attributed lead, so a plain lead's email is unchanged.
        ...(referredByAthleteId && invitedByFirstName
          ? {
              invitedBy: invitedByFirstName,
              doorUrl: `${publicOrigin(request)}/pase/verificar/${inserted.passCode}/`,
            }
          : {}),
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

    // T-AV27b: "{guest} claimed a pass with your link", in-app only, to the
    // athlete. Only for an attributed lead (flag on), and 210 decides the
    // rest (credited, once). Best effort: the lead is saved whatever happens.
    if (referredByAthleteId) {
      try {
        const claimed = await claimLeadNotification(admin, inserted.id);
        if (claimed.success) {
          await deliverNotifications(admin, claimed.data ?? [], { actorId: null, origin: new URL(request.url).origin });
        }
      } catch (error) {
        logError(error, { route: '/api/pase', action: 'av_notify_claimed', passLeadId: inserted.id });
      }
    }

    // The voucher QR only when the predicate is true for this partner; with it
    // off the body has exactly the three keys it always had.
    // T-AV29: the origin a phone can reach (publicOrigin), not request.url's,
    // which in dev is the server's own localhost.
    const qrSvg = attribution.on ? await renderVoucherQr(publicOrigin(request), inserted.passCode) : null;
    return NextResponse.json(
      {
        pass_code: inserted.passCode,
        whatsapp_url: whatsappUrl,
        storefront_url: storefrontUrl,
        ...(qrSvg ? { qr_svg: qrSvg } : {}),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    logError(error, { route: '/api/pase', action: 'POST' });
    return NextResponse.json({ error: 'Error interno.' }, { status: 500 });
  }
}
