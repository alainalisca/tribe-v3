'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';

type GateState = 'checking' | 'allowed' | 'redirecting';

interface PremiumRow {
  tribe_os_tier: 'solo' | 'team_studio' | null;
  tribe_os_status: 'active' | 'past_due' | 'canceled' | 'trialing' | null;
}

function isPremiumActive(row: PremiumRow | null): boolean {
  if (!row || !row.tribe_os_tier) return false;
  const status = row.tribe_os_status;
  return status === null || status === 'active';
}

const copy = {
  en: {
    welcome: 'Welcome to Tribe.OS',
    placeholder:
      'You are one of our first design partners. The full Tribe.OS dashboard with client management, paid sessions, and revenue analytics is being built right now based on what you and a small group of other instructors are telling us. We will walk you through it in person on the next sit-down.',
    backLabel: 'Back to Tribe',
    redirectingLabel: 'Redirecting',
  },
  // ES PENDING VERONICA REVIEW
  es: {
    welcome: 'Bienvenido a Tribe.OS',
    placeholder:
      'Eres uno de nuestros primeros socios de diseño. El panel completo de Tribe.OS con gestión de clientes, sesiones de pago y analítica de ingresos se está construyendo ahora mismo con base en lo que tú y un grupo pequeño de instructores nos están diciendo. Te lo mostraremos en persona en la próxima reunión.',
    backLabel: 'Volver a Tribe',
    redirectingLabel: 'Redirigiendo',
  },
} as const;

export default function TribeOSDashboardPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const s = copy[language];

  const [gate, setGate] = useState<GateState>('checking');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setGate('redirecting');
          router.replace('/#tribe-os');
        }
        return;
      }
      const { data, error } = await supabase
        .from('users')
        .select('tribe_os_tier, tribe_os_status')
        .eq('id', user.id)
        .single();
      if (cancelled) return;
      if (error || !isPremiumActive(data as PremiumRow | null)) {
        setGate('redirecting');
        router.replace('/#tribe-os');
        return;
      }
      setGate('allowed');
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (gate === 'checking' || gate === 'redirecting') {
    return (
      <main className="min-h-screen bg-tribe-dark flex items-center justify-center px-4">
        <p className="text-white/70 text-sm uppercase tracking-[0.1em]">
          {gate === 'redirecting' ? s.redirectingLabel : ''}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-tribe-dark px-4 py-16 sm:py-24">
      <div className="max-w-2xl mx-auto">
        <p className="text-tribe-green uppercase tracking-[0.1em] text-sm font-semibold mb-4">Tribe.OS</p>
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-[1.1] mb-6">{s.welcome}</h1>
        <p className="text-base sm:text-lg text-white/80 leading-relaxed mb-10">{s.placeholder}</p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-tribe-green text-tribe-dark text-base font-bold rounded-lg shadow-[0_4px_20px_rgba(132,204,22,0.35)] hover:shadow-[0_6px_28px_rgba(132,204,22,0.5)] hover:-translate-y-0.5 transition-all"
        >
          {s.backLabel}
        </Link>
      </div>
    </main>
  );
}
