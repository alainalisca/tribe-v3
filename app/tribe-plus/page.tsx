'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, Zap, BarChart3, Shield } from 'lucide-react';
import BottomNav from '@/components/BottomNav';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { SUBSCRIPTION_TIERS } from '@/lib/subscription/config';
import { trackEvent } from '@/lib/analytics';
import { showInfo } from '@/lib/toast';
import { createClient } from '@/lib/supabase/client';
import { fetchUserIsAdmin } from '@/lib/dal';

type BillingCycle = 'monthly' | 'annual';

function formatAmount(cents: number, currency: 'COP' | 'USD'): string {
  if (currency === 'USD') return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)} USD`;
  return `$${Math.round(cents).toLocaleString('es-CO')} COP`;
}

export default function TribePlusPage() {
  const tI18n = useTranslations('tribe-plus');
  const router = useRouter();
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [currency] = useState<'COP' | 'USD'>('COP');
  const [notified, setNotified] = useState(false);

  // Tribe+ is gated while billing and the premium benefits are not live yet:
  // only admins may preview it; everyone else is redirected home so testers
  // and users do not land on a non-functional paywall. Remove this gate when
  // Tribe+ is ready to launch.
  const [authorized, setAuthorized] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.replace('/auth');
        return;
      }
      const adminResult = await fetchUserIsAdmin(supabase, user.id);
      if (cancelled) return;
      if (!adminResult.success || !adminResult.data) {
        router.replace('/');
        return;
      }
      setAuthorized(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  const plus = SUBSCRIPTION_TIERS.plus;
  const monthlyCents = plus.price[currency];
  const annualCents = plus.priceAnnual?.[currency] ?? 0;
  const effectiveCents = cycle === 'annual' ? annualCents : monthlyCents;
  const annualSavings =
    annualCents > 0 && monthlyCents > 0 ? Math.max(0, Math.round(100 - (annualCents / (monthlyCents * 12)) * 100)) : 0;

  const t = {
    headline: tI18n('trainSmarterSaveMoreGet'),
    cta: tI18n('startFreeTrial7Days'),
    monthly: tI18n('monthly'),
    annual: tI18n('annual'),
    save: (pct: number) => tI18n('savePct', { pct: pct }),
    per: tI18n('month'),
    annualLabel: tI18n('year'),
    features: [
      {
        icon: Zap,
        title: tI18n('zeroBookingFees'),
        desc: tI18n('saveOnEveryPaidSession'),
      },
      {
        icon: Sparkles,
        title: tI18n('24HourEarlyAccess'),
        desc: tI18n('seeAndBookNewSessions'),
      },
      {
        icon: BarChart3,
        title: tI18n('advancedTrainingStats'),
        desc: tI18n('deepTrainingAnalyticsOnMy'),
      },
      {
        icon: Shield,
        title: tI18n('tribeBadge'),
        desc: tI18n('standOutInTheCommunity'),
      },
    ],
    faqTitle: tI18n('faq'),
    faqs: [
      {
        q: tI18n('canICancelAnytime'),
        a: tI18n('yesYouKeepAccessUntil'),
      },
      {
        q: tI18n('whatHappensToMyBookings'),
        a: tI18n('youKeepAllExistingBookings'),
      },
    ],
  };

  // Hold rendering until the admin check passes; non-admins are redirected
  // and should never see the Tribe+ content flash.
  if (!authorized) {
    return <div className="min-h-screen bg-theme-page" />;
  }

  return (
    <div className="min-h-screen pb-24 bg-theme-page text-theme-primary">
      <div className="max-w-xl mx-auto px-4 pt-8 space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#84cc16] text-slate-900 text-xs font-bold tracking-widest">
            <Sparkles className="w-3 h-3" /> TRIBE+
          </div>
          <h1 className="text-3xl font-extrabold">{t.headline}</h1>

          {/* Cycle toggle */}
          <div className="inline-flex rounded-xl bg-theme-card p-1">
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
              <span className="text-base font-medium text-theme-tertiary ml-1">
                {cycle === 'annual' ? t.annualLabel : t.per}
              </span>
            </p>
          </div>

          {/* Billing isn't live yet. Rather than a fake checkout or a
              native alert, capture genuine demand (analytics) and tell
              the user the honest truth via a styled toast. */}
          <button
            type="button"
            disabled={notified}
            className="mt-4 w-full py-3 rounded-xl bg-[#84cc16] hover:bg-[#A3E635] text-slate-900 text-sm font-bold disabled:opacity-70"
            onClick={() => {
              trackEvent('tribe_plus_interest', { cycle, currency });
              setNotified(true);
              showInfo(tI18n('tribeIsComingSoonWe'));
            }}
          >
            {notified ? tI18n('weLlNotifyYou') : t.cta}
          </button>
        </div>

        {/* Benefits grid */}
        <div className="grid grid-cols-2 gap-3">
          {t.features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-theme-card rounded-2xl p-4">
              <Icon className="w-5 h-5 text-[#A3E635] mb-2" />
              <h3 className="text-sm font-bold">{title}</h3>
              <p className="text-xs text-theme-tertiary mt-1">{desc}</p>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <section>
          <h2 className="text-lg font-bold mb-3">{t.faqTitle}</h2>
          <ul className="space-y-3">
            {t.faqs.map(({ q, a }) => (
              <li key={q} className="bg-theme-card rounded-xl p-4">
                <p className="text-sm font-semibold mb-1">{q}</p>
                <p className="text-xs text-theme-tertiary">{a}</p>
              </li>
            ))}
          </ul>
        </section>

        <Link
          href="/subscriptions"
          className="block text-center text-sm text-theme-tertiary hover:text-white underline"
        >
          {tI18n('alreadyAMemberManageSubscription')}
        </Link>
      </div>

      <BottomNav />
    </div>
  );
}
