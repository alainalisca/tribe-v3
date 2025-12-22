import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

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
    const { email, password, name, birthDate, acceptedTos } = await request.json();

    // Server-side validation
    if (!email || !password || !name || !birthDate) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    // Age validation (server-side - cannot be bypassed)
    const age = calculateAge(birthDate);
    if (age < 18) {
      return NextResponse.json({ error: 'You must be 18 or older to use Tribe' }, { status: 403 });
    }

    // ToS validation
    if (!acceptedTos) {
      return NextResponse.json({ error: 'You must accept the Terms of Service' }, { status: 400 });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
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
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
