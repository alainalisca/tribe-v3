'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Sparkles, Zap, BarChart3, Shield } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { useLanguage } from '@/lib/LanguageContext';
import { SUBSCRIPTION_TIERS } from '@/lib/subscription/config';

type BillingCycle = 'monthly' | 'annual';

function formatAmount(cents: number, currency: 'COP' | 'USD'): string {
  if (currency === 'USD') return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)} USD`;
  return `$${Math.round(cents).toLocaleString('es-CO')} COP`;
}

export default function TribePlusPage() {
  const { language } = useLanguage();
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [currency] = useState<'COP' | 'USD'>('COP');

  const plus = SUBSCRIPTION_TIERS.plus;
  const monthlyCents = plus.price[currency];
  const annualCents = plus.priceAnnual?.[currency] ?? 0;
  const effectiveCents = cycle === 'annual' ? annualCents : monthlyCents;
  const annualSavings =
    annualCents > 0 && monthlyCents > 0 ? Math.max(0, Math.round(100 - (annualCents / (monthlyCents * 12)) * 100)) : 0;

  const t = {
    headline:
      language === 'es' ? 'Entrena mejor. Ahorra más. Ten prioridad.' : 'Train smarter. Save more. Get priority.',
    cta: language === 'es' ? 'Empezar Prueba Gratis — 7 días' : 'Start Free Trial — 7 Days',
    monthly: language === 'es' ? 'Mensual' : 'Monthly',
    annual: language === 'es' ? 'Anual' : 'Annual',
    save: (pct: number) => (language === 'es' ? `Ahorra ${pct}%` : `Save ${pct}%`),
    per: language === 'es' ? '/mes' : '/month',
    annualLabel: language === 'es' ? '/año' : '/year',
    features: [
      {
        icon: Zap,
        title: language === 'es' ? 'Cero Cargos por Reserva' : 'Zero Booking Fees',
        desc: language === 'es' ? 'Ahorra en cada sesión pagada que reserves' : 'Save on every paid session you book',
      },
      {
        icon: Sparkles,
        title: language === 'es' ? '24h de Acceso Anticipado' : '24-Hour Early Access',
        desc:
          language === 'es'
            ? 'Ve y reserva nuevas sesiones antes que nadie'
            : 'See and book new sessions before anyone else',
      },
      {
        icon: BarChart3,
        title: language === 'es' ? 'Estadísticas Avanzadas' : 'Advanced Training Stats',
        desc:
          language === 'es'
            ? 'Análisis de entrenamiento a profundidad en Mi Entrenamiento'
            : 'Deep training analytics on My Training',
      },
      {
        icon: Shield,
        title: language === 'es' ? 'Insignia Tribe+' : 'Tribe+ Badge',
        desc:
          language === 'es'
            ? 'Destaca en la comunidad con tu insignia ✦'
            : 'Stand out in the community with your ✦ badge',
      },
    ],
    faqTitle: language === 'es' ? 'Preguntas Frecuentes' : 'FAQ',
    faqs: [
      {
        q: language === 'es' ? '¿Puedo cancelar en cualquier momento?' : 'Can I cancel anytime?',
        a:
          language === 'es'
            ? 'Sí. Mantienes el acceso hasta el final de tu período.'
            : 'Yes. You keep access until the end of your billing period.',
      },
      {
        q: language === 'es' ? '¿Qué pasa con mis reservas si cancelo?' : 'What happens to my bookings if I cancel?',
        a: language === 'es' ? 'Mantienes todas las reservas existentes.' : 'You keep all existing bookings.',
      },
    ],
  };

  return (
    <div className="min-h-screen pb-24 bg-[#272D34] text-white">
      <div className="max-w-xl mx-auto px-4 pt-8 space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#84cc16] text-slate-900 text-xs font-bold tracking-widest">
            <Sparkles className="w-3 h-3" /> TRIBE+
          </div>
          <h1 className="text-3xl font-extrabold">{t.headline}</h1>

          {/* Cycle toggle */}
          <div className="inline-flex rounded-xl bg-[#3D4349] p-1">
            {(['monthly', 'annual'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCycle(c)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                  cycle === c ? 'bg-[#84cc16] text-slate-900' : 'text-gray-300'
                }`}
              >
                {c === 'monthly' ? t.monthly : t.annual}
                {c === 'annual' && annualSavings > 0 && (
                  <span className="ml-1 text-[10px] text-[#A3E635]">{t.save(annualSavings)}</span>
                )}
              </button>
            ))}
          </div>

          <div className="pt-2">
            <p className="text-4xl font-extrabold">
              {formatAmount(effectiveCents, currency)}
              <span className="text-base font-medium text-gray-400 ml-1">
                {cycle === 'annual' ? t.annualLabel : t.per}
              </span>
            </p>
          </div>

          <button
            type="button"
            className="mt-4 w-full py-3 rounded-xl bg-[#84cc16] hover:bg-[#A3E635] text-slate-900 text-sm font-bold"
            onClick={() => {
              // Payment flow to be wired once instructor approves
              alert(language === 'es' ? 'Próximamente: flujo de pago' : 'Coming soon: payment flow');
            }}
          >
            {t.cta}
          </button>
        </div>

        {/* Benefits grid */}
        <div className="grid grid-cols-2 gap-3">
          {t.features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-[#3D4349] rounded-2xl p-4">
              <Icon className="w-5 h-5 text-[#A3E635] mb-2" />
              <h3 className="text-sm font-bold">{title}</h3>
              <p className="text-xs text-gray-400 mt-1">{desc}</p>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <section>
          <h2 className="text-lg font-bold mb-3">{t.faqTitle}</h2>
          <ul className="space-y-3">
            {t.faqs.map(({ q, a }) => (
              <li key={q} className="bg-[#3D4349] rounded-xl p-4">
                <p className="text-sm font-semibold mb-1">{q}</p>
                <p className="text-xs text-gray-400">{a}</p>
              </li>
            ))}
          </ul>
        </section>

        <Link
          href="/settings/subscription"
          className="block text-center text-sm text-gray-400 hover:text-white underline"
        >
          {language === 'es' ? 'Ya eres miembro? Administrar suscripción' : 'Already a member? Manage subscription'}
        </Link>
      </div>

      <BottomNav />
    </div>
  );
}
