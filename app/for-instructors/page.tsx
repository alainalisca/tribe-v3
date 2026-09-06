'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import MarketingLayout from '@/components/marketing/MarketingLayout';
import InstructorHero from '@/components/marketing/instructors/InstructorHero';
import RevenueModel from '@/components/marketing/instructors/RevenueModel';
import WhatYouCanSell from '@/components/marketing/instructors/WhatYouCanSell';
import HowItWorks from '@/components/marketing/instructors/HowItWorks';
import InstructorFAQ from '@/components/marketing/instructors/InstructorFAQ';

// PAY-01 layer 2: there is no paid instructor tier, so there is no trial to
// start. Plain en/es object so the section carries no language ternaries.
const copy = {
  en: {
    heading: 'Join Instructors in Medellín',
    sub: 'Free. No contracts, no commission.',
    cta: 'Create your instructor profile',
  },
  es: {
    heading: 'Únete a los Instructores en Medellín',
    sub: 'Gratis. Sin contratos, sin comisión.',
    cta: 'Crea tu perfil de instructor',
  },
} as const;

export default function ForInstructorsPage() {
  const { language } = useLanguage();
  const s = copy[language];

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
          <h2 className="text-3xl font-black mb-4">{s.heading}</h2>
          <p className="text-gray-400 mb-8">{s.sub}</p>
          <Link
            href="/auth"
            className="inline-block px-8 py-4 bg-tribe-green text-tribe-dark font-bold rounded-lg text-lg hover:bg-tribe-green-hover transition-colors"
          >
            {s.cta}
          </Link>
        </div>
      </section>
    </MarketingLayout>
  );
}
