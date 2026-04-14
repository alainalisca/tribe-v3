'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import { useScrollReveal } from '@/hooks/useScrollReveal';

const INSTRUCTOR_PHOTO = 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800&q=80'; // instructor leading group

const points = {
  en: [
    'Your own storefront page athletes can browse',
    'Set your own prices in COP or USD',
    'Sell sessions, merch, and training plans',
    'Built-in reminders so athletes show up',
    'Promo codes to attract first-timers',
    'Real-time analytics on bookings and revenue',
  ],
  es: [
    'Tu propia página de perfil para que te encuentren',
    'Fija tus precios en COP o USD',
    'Vende sesiones, mercancía y planes de entrenamiento',
    'Recordatorios automáticos para que los atletas asistan',
    'Códigos promo para atraer nuevos atletas',
    'Analíticas en tiempo real de reservas e ingresos',
  ],
} as const;

const t = {
  en: {
    heading: 'Your Fitness Business, One App',
    sub: 'No gym. No website. No Instagram funnel. Just your skills and your phone.',
    feeTitle: 'Simple, Fair Pricing',
    feeBody: 'You keep 85% of every paid session. First 3 months: 0% platform fee — you keep every peso.',
    cta: 'Learn More for Instructors',
  },
  es: {
    heading: 'Tu Negocio Fitness, Una App',
    sub: 'Sin gimnasio. Sin sitio web. Sin funnel de Instagram. Solo tus habilidades y tu celular.',
    feeTitle: 'Precio Simple y Justo',
    feeBody: 'Te quedas con el 85% de cada sesión paga. Primeros 3 meses: 0% de comisión — te quedas con todo.',
    cta: 'Más Info para Instructores',
  },
} as const;

export default function ForInstructorsPreview() {
  const { language } = useLanguage();
  const s = t[language];
  const { ref, visible } = useScrollReveal(0.1);

  return (
    <section id="instructors-preview" className="bg-tribe-surface py-20 px-4 overflow-hidden">
      <div
        ref={ref}
        className={`max-w-6xl mx-auto transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          {/* Photo */}
          <div className="relative aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl">
            <Image
              src={INSTRUCTOR_PHOTO}
              alt={
                language === 'es'
                  ? 'Instructora liderando una sesión de entrenamiento'
                  : 'Instructor leading a training session'
              }
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
            {/* Floating stat card */}
            <div className="absolute bottom-6 left-6 right-6 bg-tribe-dark/90 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-black text-tribe-green">85%</div>
                  <div className="text-xs text-gray-400">{language === 'es' ? 'Para ti' : 'Goes to you'}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-white">$0</div>
                  <div className="text-xs text-gray-400">
                    {language === 'es' ? 'Primeros 3 meses' : 'First 3 months'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-3">{s.heading}</h2>
            <p className="text-base text-gray-400 mb-8">{s.sub}</p>

            <ul className="space-y-3 mb-8">
              {points[language].map((point, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-tribe-green/20 flex items-center justify-center shrink-0">
                    <span className="text-tribe-green text-xs">✓</span>
                  </span>
                  <span className="text-sm text-gray-300">{point}</span>
                </li>
              ))}
            </ul>

            {/* Fee highlight */}
            <div className="bg-tribe-green/10 border border-tribe-green/30 rounded-2xl p-5 mb-8">
              <h3 className="text-base font-bold text-tribe-green mb-1">{s.feeTitle}</h3>
              <p className="text-sm text-gray-300 leading-relaxed">{s.feeBody}</p>
            </div>

            <Link
              href="/for-instructors"
              className="inline-block px-8 py-3.5 bg-tribe-green text-tribe-dark font-bold rounded-xl shadow-[0_4px_20px_rgba(192,232,99,0.3)] hover:shadow-[0_6px_28px_rgba(192,232,99,0.45)] hover:-translate-y-0.5 transition-all"
            >
              {s.cta}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
