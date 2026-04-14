'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';

export default function InstructorHero() {
  const { language } = useLanguage();
  const es = language === 'es';

  return (
    <section className="pt-32 pb-20 px-4 text-center">
      <div className="max-w-3xl mx-auto">
        <p className="text-tribe-green font-semibold text-sm uppercase tracking-widest mb-4">
          {es ? 'Para Instructores' : 'For Instructors'}
        </p>
        <h1 className="text-4xl sm:text-5xl font-black leading-tight mb-6">
          {es ? 'Construye Tu Negocio Fitness en Tribe' : 'Build Your Fitness Business on Tribe'}
        </h1>
        <p className="text-lg text-gray-400 mb-8 max-w-xl mx-auto">
          {es
            ? 'Publica sesiones, vende productos y haz crecer tu marca — todo en una sola plataforma.'
            : 'List sessions, sell products, and grow your brand — all on one platform.'}
        </p>
        <Link
          href="/auth"
          className="inline-block px-8 py-4 bg-tribe-green text-tribe-dark font-bold rounded-lg text-lg hover:bg-tribe-green-hover transition-colors"
        >
          {es ? 'Empieza Tu Prueba Gratis' : 'Start Your Free Trial'}
        </Link>
      </div>
    </section>
  );
}
