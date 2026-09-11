'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { fetchPartnerByUserId, fetchPartnerStats } from '@/lib/dal/featuredPartners';
import type { FeaturedPartner, PartnerStats } from '@/lib/dal/featuredPartners';
import BottomNav from '@/components/BottomNav';
import PartnerDashboardStats from '@/components/partner/PartnerDashboardStats';
import { ArrowLeft, Loader } from 'lucide-react';
import VenueRequestsSection from '@/components/partner/VenueRequestsSection';
import { useVenueRequests } from '@/hooks/useVenueRequests';

type Period = '7d' | '30d' | '90d';

export default function PartnerDashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();

  const [partner, setPartner] = useState<FeaturedPartner | null>(null);
  // Hooks cannot be conditional, and `partner` is null until the guard above
  // resolves, so the queue loads with an empty id and fetches nothing until it
  // has one. fetchVenueRequests short-circuits on a falsy partner id.
  const venue = useVenueRequests({
    partnerId: partner?.id ?? '',
    gymName: partner?.business_name ?? '',
    gymUserId: partner?.user_id ?? '',
    initialAutoApprove: partner?.auto_approve_roster ?? true,
  });
  const [stats, setStats] = useState<PartnerStats | null>(null);
  const [period, setPeriod] = useState<Period>('30d');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth');
        return;
      }

      const pResult = await fetchPartnerByUserId(supabase, user.id);
      if (!pResult.success || !pResult.data || pResult.data.status !== 'active') {
        router.push('/partners');
        return;
      }
      setPartner(pResult.data);

      const sResult = await fetchPartnerStats(supabase, pResult.data.id);
      if (sResult.success && sResult.data) {
        setStats(sResult.data);
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t = (en: string, es: string) => (language === 'es' ? es : en);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-dark flex items-center justify-center">
        <Loader className="w-8 h-8 text-tribe-green animate-spin" />
      </div>
    );
  }

  if (!partner || !stats) return null;

  const periods: { value: Period; label: string }[] = [
    { value: '7d', label: t('7 days', '7 días') },
    { value: '30d', label: t('30 days', '30 días') },
    { value: '90d', label: t('90 days', '90 días') },
  ];

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-tribe-dark pb-32">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-white dark:bg-tribe-card border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center gap-3 px-4">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white" />
          </button>
          <h1 className="text-lg font-bold text-stone-900 dark:text-white">
            {t('Affiliate Dashboard', 'Panel de Afiliado')}
          </h1>
        </div>
      </div>

      <div className="pt-[72px] max-w-2xl md:max-w-4xl mx-auto px-4">
        {/* Partner name + badge */}
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-xl font-extrabold text-stone-900 dark:text-white">{partner.business_name}</h2>
          <span className="bg-tribe-green/15 border border-tribe-green/30 text-tribe-green text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
            {partner.tier}
          </span>
        </div>

        {/* Period selector */}
        <div className="flex gap-2 mb-5">
          {periods.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                period === p.value
                  ? 'bg-tribe-green text-slate-900'
                  : 'bg-white dark:bg-tribe-surface text-stone-700 dark:text-gray-200 border border-stone-200 dark:border-tribe-mid'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Venue requests sit above the metrics: an instructor waiting on a
            decision is more urgent than last week's impressions. */}
        <VenueRequestsSection
          gymName={partner.business_name}
          requests={venue.requests}
          loading={venue.loading}
          deciding={venue.deciding}
          autoApprove={venue.autoApprove}
          onDecide={(request, decision) => void venue.decide(request, decision)}
          onToggleAutoApprove={(next) => void venue.toggleAutoApprove(next)}
        />

        {/* Stats grid */}
        <PartnerDashboardStats stats={stats} language={language} />

        {/* The Bookings-by-Day chart and the Performance Metrics block were
            removed here (T-GYM2). The chart's bars were Math.random(), and
            "Avg Rating" / "Sessions/Month" rendered partner.min_rating and
            partner.min_sessions_per_month -- the partnership's CONTRACT
            MINIMUMS -- as achievements, next to a green "Target: 4.0+". A gym
            with no sessions and no ratings read its own contract back as
            performance it had met.
            
            This PR is what makes the page reachable at all, so the four tiles
            above are the page. They read real data and their zeros are true.
            No replacements, no empty states: see the follow-up ticket for
            wiring real metrics. */}
      </div>

      <BottomNav />
    </div>
  );
}
