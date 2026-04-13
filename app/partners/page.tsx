'use client';

import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import BottomNav from '@/components/BottomNav';
import PartnerValueHero from '@/components/partner/PartnerValueHero';
import PartnerValueCards from '@/components/partner/PartnerValueCards';
import PartnerRequirements from '@/components/partner/PartnerRequirements';
import PartnerBenefits from '@/components/partner/PartnerBenefits';
import { ArrowLeft } from 'lucide-react';

export default function PartnersPage() {
  const router = useRouter();
  const { language } = useLanguage();

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-tribe-dark pb-32">
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-white dark:bg-[#2C3137] border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-2xl mx-auto h-14 flex items-center gap-3 px-4">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white" />
          </button>
          <h1 className="text-lg font-bold text-stone-900 dark:text-white">
            {language === 'es' ? 'Afiliados Destacados' : 'Featured Affiliates'}
          </h1>
        </div>
      </div>

      <div className="pt-[72px] max-w-2xl mx-auto px-4">
        <PartnerValueHero language={language} />
        <PartnerValueCards language={language} />
        <PartnerRequirements language={language} />
        <PartnerBenefits language={language} />

        {/* Introductory Offer */}
        <div className="mt-6 bg-tribe-green/10 border border-tribe-green/30 rounded-2xl p-5 text-center">
          <div className="text-3xl mb-2">🎉</div>
          <h3 className="text-lg font-bold text-stone-900 dark:text-white mb-1">
            {language === 'es' ? 'Gratis por 6 meses' : 'Free for 6 months'}
          </h3>
          <p className="text-sm text-stone-600 dark:text-[#B1B3B6] mb-4">
            {language === 'es'
              ? 'Oferta introductoria para los primeros afiliados. Sin costo, sin compromiso.'
              : 'Introductory offer for early affiliates. No cost, no commitment.'}
          </p>
          <button
            onClick={() => router.push('/partners/apply')}
            className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-xl text-base hover:bg-lime-500 transition"
          >
            {language === 'es' ? 'Aplicar Ahora' : 'Apply Now'}
          </button>
        </div>

        <div className="h-8" />
      </div>

      <BottomNav />
    </div>
  );
}
