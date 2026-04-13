'use client';

import Link from 'next/link';
import { Zap } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

interface FirstMoverCTAProps {
  locationName: string;
  language: string;
}

export default function FirstMoverCTA({ locationName, language }: FirstMoverCTAProps) {
  const { language: currentLanguage } = useLanguage();
  const lang = currentLanguage || language;

  const title =
    lang === 'es'
      ? `Sé el primero en alojar una sesión en ${locationName}!`
      : `Be the first to host a session in ${locationName}!`;

  const subtitle =
    lang === 'es'
      ? 'Gana el distintivo 🏔️ Pionero y obtén colocación prioritaria'
      : 'Earn the 🏔️ Trailblazer badge and get priority placement';

  const buttonText = lang === 'es' ? 'Crear Primera Sesión' : 'Create First Session';

  return (
    <div className="w-full bg-gradient-to-br from-[#A3E635]/20 to-[#9EE551]/10 border border-tribe-green rounded-xl p-6 md:p-8 text-center space-y-4">
      {/* Mountain icon */}
      <div className="flex justify-center">
        <span className="text-5xl md:text-6xl animate-bounce">🏔️</span>
      </div>

      {/* Title */}
      <h2 className="text-2xl md:text-3xl font-bold text-theme-primary leading-tight">{title}</h2>

      {/* Subtitle */}
      <p className="text-base md:text-lg text-stone-600 dark:text-gray-300">{subtitle}</p>

      {/* Benefit list */}
      <div className="flex flex-col gap-2 text-sm text-stone-600 dark:text-gray-400 pt-2">
        <div className="flex items-center justify-center gap-2">
          <Zap className="w-4 h-4 text-tribe-green" />
          <span>{lang === 'es' ? 'Reconocimiento especial en tu perfil' : 'Special recognition on your profile'}</span>
        </div>
        <div className="flex items-center justify-center gap-2">
          <Zap className="w-4 h-4 text-tribe-green" />
          <span>
            {lang === 'es' ? 'Mayor visibilidad de sesiones en el área' : 'Higher session visibility in the area'}
          </span>
        </div>
        <div className="flex items-center justify-center gap-2">
          <Zap className="w-4 h-4 text-tribe-green" />
          <span>
            {lang === 'es' ? 'Pionero de la comunidad de fitness local' : 'Pioneer of the local fitness community'}
          </span>
        </div>
      </div>

      {/* CTA Button */}
      <Link
        href="/create"
        aria-label={buttonText}
        className="inline-block pt-2 bg-tribe-green-light hover:bg-[#94D91E] dark:bg-tribe-green-light dark:hover:bg-[#94D91E] text-[#272D34] dark:text-[#272D34] font-bold py-3 px-8 rounded-lg transition-colors text-base flex items-center justify-center gap-2 mx-auto"
      >
        {buttonText} <span aria-hidden="true">→</span>
      </Link>

      {/* Confidence note */}
      <p className="text-xs text-stone-500 dark:text-gray-400 pt-2">
        {lang === 'es'
          ? 'Tu sesión sera visible para miles de personas en tu area'
          : 'Your session will be visible to thousands of people in your area'}
      </p>
    </div>
  );
}
