/**
 * POST /api/tribe-os-waitlist
 * Public marketing form — collects fitness instructor signups for the
 * "Tribe OS - Coming Soon" landing section. No auth (anyone can join).
 *
 * Defenses:
 *  - IP-based rate limit (5/min) to deter spam.
 *  - Strict input validation (length + email format).
 *  - Unique-email constraint at the DB level → 409 on duplicate.
 *  - Service-role client (rate_limits + tribe_os_waitlist insert) bypasses RLS;
 *    the table's RLS still allows anon INSERT, but service-role keeps the
 *    rate-limit check from hitting `42501` like every other endpoint did.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { getServiceRoleClient } from '@/lib/supabase/admin';
import { insertTribeOSWaitlistEntry } from '@/lib/dal/tribeOSWaitlist';

const MAX_LEN = 255;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const admin = getServiceRoleClient();

    const { allowed } = await checkRateLimit(admin, `tribe-os-waitlist:${ip}`, 5, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const raw = body as Record<string, unknown>;
    const language: 'en' | 'es' = raw.language === 'es' ? 'es' : 'en';
    const t = (en: string, es: string) => (language === 'es' ? es : en);

    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : '';
    const whatTheyTeach = typeof raw.whatTheyTeach === 'string' ? raw.whatTheyTeach.trim() : '';
    const sessionsPerWeekRaw = raw.sessionsPerWeek;

    if (!name || !email || !whatTheyTeach) {
      return NextResponse.json(
        {
          error: t('Name, email, and what you teach are required.', 'Nombre, correo y qué enseñas son obligatorios.'),
        },
        { status: 400 }
      );
    }

    if (name.length > MAX_LEN || email.length > MAX_LEN || whatTheyTeach.length > MAX_LEN) {
      return NextResponse.json(
        { error: t('One of the fields is too long.', 'Uno de los campos es demasiado largo.') },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: t('Invalid email address.', 'Dirección de correo inválida.') },
        { status: 400 }
      );
    }

    let sessionsPerWeek: number | null = null;
    if (sessionsPerWeekRaw !== undefined && sessionsPerWeekRaw !== null && sessionsPerWeekRaw !== '') {
      const n = typeof sessionsPerWeekRaw === 'number' ? sessionsPerWeekRaw : Number(sessionsPerWeekRaw);
      if (!Number.isInteger(n) || n < 0 || n > 1000) {
        return NextResponse.json(
          {
            error: t(
              'Sessions per week must be a positive whole number.',
              'Sesiones por semana debe ser un número entero positivo.'
            ),
          },
          { status: 400 }
        );
      }
      sessionsPerWeek = n;
    }

    const result = await insertTribeOSWaitlistEntry(admin, {
      name,
      email,
      what_they_teach: whatTheyTeach,
      sessions_per_week: sessionsPerWeek,
      language,
    });

    if (!result.success) {
      if (result.error === 'duplicate') {
        return NextResponse.json(
          {
            error: t("You're already on the waitlist.", 'Ya estás en la lista de espera.'),
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: t('Could not join waitlist. Please try again.', 'No pudimos agregarte. Intenta de nuevo.') },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: unknown) {
    logError(error, { route: '/api/tribe-os-waitlist', action: 'POST' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
