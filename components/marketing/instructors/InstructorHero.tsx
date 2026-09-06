'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';

// PAY-01 layer 2: there is no paid instructor tier, so there is no trial to
// start, and the sub no longer promises product sales. The hero carries its
// own wording rather than repeating the footer CTA further down this page.
// Plain en/es object so the section carries no ternaries.
const copy = {
  en: {
    eyebrow: 'For Instructors',
    headline: 'Build Your Fitness Business on Tribe',
    sub: 'Publish your sessions, get your own page, and let people in Medellin find you. You keep everything you charge.',
    cta: 'Start free',
  },
  es: {
    eyebrow: 'Para Instructores',
    headline: 'Construye Tu Negocio Fitness en Tribe',
    sub: 'Publica tus sesiones, ten tu propia página y deja que la gente en Medellín te encuentre. Te quedas con todo lo que cobras.',
    cta: 'Empieza gratis',
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
