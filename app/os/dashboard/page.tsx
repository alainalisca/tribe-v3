'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CreditCard, Users } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { showError } from '@/lib/toast';

const copy = {
  en: {
    welcome: 'Welcome to Tribe.OS',
    placeholder:
      'You are one of our first design partners. The full Tribe.OS dashboard with paid sessions and revenue analytics is being built right now based on what you and a small group of other instructors are telling us. Client management is live below.',
    clientsCta: 'Manage clients',
    portalCta: 'Manage subscription',
    portalLoading: 'Opening Stripe',
    portalError: 'Could not open Stripe portal. Please try again.',
    backLabel: 'Back to Tribe',
    redirectingLabel: 'Redirecting',
  },
  // ES PENDING VERONICA REVIEW
  es: {
    welcome: 'Bienvenido a Tribe.OS',
    placeholder:
      'Eres uno de nuestros primeros socios de diseño. El panel completo de Tribe.OS con sesiones de pago y analítica de ingresos se está construyendo ahora mismo con base en lo que tú y un grupo pequeño de instructores nos están diciendo. La gestión de clientes ya está disponible abajo.',
    clientsCta: 'Gestionar clientes',
    portalCta: 'Gestionar suscripción',
    portalLoading: 'Abriendo Stripe',
    portalError: 'No se pudo abrir el portal de Stripe. Por favor intenta de nuevo.',
    backLabel: 'Volver a Tribe',
    redirectingLabel: 'Redirigiendo',
  },
} as const;

export default function TribeOSDashboardPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const { state } = useTribeOSPremiumGate();
  const [openingPortal, setOpeningPortal] = useState(false);

  async function handlePortal() {
    if (openingPortal) return;
    setOpeningPortal(true);
    try {
      const res = await fetch('/api/tribe-os/subscription/portal/', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string; error?: string };
      if (!res.ok || !body.success || !body.url) {
        showError(body.error || s.portalError);
        setOpeningPortal(false);
        return;
      }
      window.location.href = body.url;
      // No reset — page is navigating away.
    } catch {
      showError(s.portalError);
      setOpeningPortal(false);
    }
  }

  if (state !== 'allowed') {
    return (
      <main className="min-h-screen bg-tribe-dark flex items-center justify-center px-4">
        <p className="text-white/70 text-sm uppercase tracking-[0.1em]">
          {state === 'redirecting' ? s.redirectingLabel : ''}
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
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <Link
            href="/os/clients"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-tribe-green text-tribe-dark text-base font-bold rounded-lg shadow-[0_4px_20px_rgba(132,204,22,0.35)] hover:shadow-[0_6px_28px_rgba(132,204,22,0.5)] hover:-translate-y-0.5 transition-all"
          >
            <Users className="w-4 h-4" />
            {s.clientsCta}
          </Link>
          <button
            type="button"
            onClick={handlePortal}
            disabled={openingPortal}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-tribe-surface text-white text-base font-bold rounded-lg hover:bg-tribe-mid transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <CreditCard className="w-4 h-4" />
            {openingPortal ? `${s.portalLoading}…` : s.portalCta}
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 bg-tribe-surface text-white text-base font-bold rounded-lg hover:bg-tribe-mid transition-colors"
          >
            {s.backLabel}
          </Link>
        </div>
      </div>
    </main>
  );
}
