import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

function calculateAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { allowed } = rateLimit(ip, { maxRequests: 5, windowMs: 60_000 });
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const { email, password, name, birthDate, acceptedTos, language } = await request.json();
    const lang = (language === 'es' ? 'es' : 'en') as 'en' | 'es';

    // Server-side validation
    if (!email || !password || !name || !birthDate) {
      return NextResponse.json(
        { error: lang === 'es' ? 'Todos los campos son obligatorios' : 'All fields are required' },
        { status: 400 }
      );
    }

    // Age validation (server-side - cannot be bypassed)
    const age = calculateAge(birthDate);
    if (age < 18) {
      return NextResponse.json(
        { error: lang === 'es' ? 'Debes tener 18 años o más para usar Tribe' : 'You must be 18 or older to use Tribe' },
        { status: 403 }
      );
    }

    // ToS validation
    if (!acceptedTos) {
      return NextResponse.json(
        { error: lang === 'es' ? 'Debes aceptar los Términos de Servicio' : 'You must accept the Terms of Service' },
        { status: 400 }
      );
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: lang === 'es' ? 'Dirección de correo inválida' : 'Invalid email address' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          date_of_birth: birthDate,
          accepted_tos: true,
          tos_accepted_at: new Date().toISOString(),
        },
        emailRedirectTo: `${request.nextUrl.origin}/auth/callback`,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message || 'Signup failed' }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    logError(error, { route: '/api/auth/signup', action: 'signup' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
