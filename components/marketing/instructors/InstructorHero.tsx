'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';

// PAY-01 layer 2: there is no paid instructor tier, so there is no trial to
// start, and the sub no longer promises product sales. Matches the footer CTA
// on this same page. Plain en/es object so the section carries no ternaries.
const copy = {
  en: {
    eyebrow: 'For Instructors',
    headline: 'Build Your Fitness Business on Tribe',
    sub: 'Free. No contracts, no commission.',
    cta: 'Create your instructor profile',
  },
  es: {
    eyebrow: 'Para Instructores',
    headline: 'Construye Tu Negocio Fitness en Tribe',
    sub: 'Gratis. Sin contratos, sin comisión.',
    cta: 'Crea tu perfil de instructor',
  },
} as const;

export default function InstructorHero() {
  const { language } = useLanguage();
  const s = copy[language];

  return (
    <section className="pt-32 pb-20 px-4 text-center">
      <div className="max-w-3xl mx-auto">
        <p className="text-tribe-green font-semibold text-sm uppercase tracking-widest mb-4">{s.eyebrow}</p>
        <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-6">{s.headline}</h1>
        <p className="text-lg text-gray-400 mb-8 max-w-xl mx-auto">{s.sub}</p>
        <Link
          href="/auth"
          className="inline-block px-8 py-4 bg-tribe-green text-tribe-dark font-bold rounded-lg text-lg hover:bg-tribe-green-hover transition-colors"
        >
          {s.cta}
        </Link>
      </div>
    </section>
  );
}
