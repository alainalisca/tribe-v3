'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import InstructorHero from '@/components/marketing/instructors/InstructorHero';
import RevenueModel from '@/components/marketing/instructors/RevenueModel';
import WhatYouCanSell from '@/components/marketing/instructors/WhatYouCanSell';
import HowItWorks from '@/components/marketing/instructors/HowItWorks';
import InstructorFAQ from '@/components/marketing/instructors/InstructorFAQ';

export default function ForInstructorsPage() {
  const { language } = useLanguage();
  const es = language === 'es';

  return (
    <MarketingLayout fullBleed>
      <InstructorHero />
      <RevenueModel />
      <WhatYouCanSell />
      <HowItWorks />
      <InstructorFAQ />

      {/* Final CTA */}
      <section className="py-20 px-4 bg-tribe-surface text-center">
        <div className="max-w-2xl md:max-w-4xl mx-auto">
          <h2 className="text-3xl font-black mb-4">
            {es ? 'Únete a los Instructores en Medellín' : 'Join Instructors in Medellín'}
          </h2>
          <p className="text-gray-400 mb-8">
            {es
              ? 'Empieza gratis. Sin contratos. Cancela cuando quieras.'
              : 'Start free. No contracts. Cancel anytime.'}
          </p>
          <Link
            href="/auth"
            className="inline-block px-8 py-4 bg-tribe-green text-tribe-dark font-bold rounded-lg text-lg hover:bg-tribe-green-hover transition-colors"
          >
            {es ? 'Empieza Tu Prueba Gratis' : 'Start Your Free Trial'}
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
