'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { fetchPartnerByUserId, fetchPartnerStats } from '@/lib/dal/featuredPartners';
import type { FeaturedPartner, PartnerStats } from '@/lib/dal/featuredPartners';
import BottomNav from '@/components/BottomNav';
import PartnerDashboardStats from '@/components/partner/PartnerDashboardStats';
import PartnerBookingsChart from '@/components/partner/PartnerBookingsChart';
import PartnerPerformance from '@/components/partner/PartnerPerformance';
import { ArrowLeft, Loader } from 'lucide-react';

type Period = '7d' | '30d' | '90d';

export default function PartnerDashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();

  const [partner, setPartner] = useState<FeaturedPartner | null>(null);
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

        {/* Stats grid */}
        <PartnerDashboardStats stats={stats} language={language} />

        {/* Bookings chart */}
        <PartnerBookingsChart language={language} period={period} />

        {/* Performance metrics */}
        <PartnerPerformance partner={partner} language={language} />
      </div>

      <BottomNav />
    </div>
  );
}
