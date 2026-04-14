'use client';

import { useLanguage } from '@/lib/LanguageContext';
import { useScrollReveal } from '@/hooks/useScrollReveal';

// TODO: Al — update these with real numbers as the platform grows
const STATS = {
  en: [
    { value: '50+', label: 'Sessions Hosted' },
    { value: '8', label: 'Neighborhoods' },
    { value: '100+', label: 'Athletes & Instructors' },
    { value: '10+', label: 'Sports' },
  ],
  es: [
    { value: '50+', label: 'Sesiones Creadas' },
    { value: '8', label: 'Barrios' },
    { value: '100+', label: 'Atletas e Instructores' },
    { value: '10+', label: 'Deportes' },
  ],
} as const;

export default function SocialProofBar() {
  const { language } = useLanguage();
  const { ref, visible } = useScrollReveal(0.3);

  return (
    <section ref={ref} className="relative bg-[#1a1f25] py-12 px-4 border-y border-white/[0.05]">
      <div
        className={`max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 transition-all duration-700 ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
        }`}
      >
        {STATS[language].map((stat, i) => (
          <div key={i} className="text-center">
            <div className="text-3xl sm:text-4xl font-black text-tribe-green-light mb-1">{stat.value}</div>
            <div className="text-xs sm:text-sm text-gray-500 uppercase tracking-wider font-medium">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
