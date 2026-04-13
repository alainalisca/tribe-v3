'use client';

import { useLanguage } from '@/lib/LanguageContext';

interface TrailblazerBadgeProps {
  areaName?: string;
  language: string;
}

export default function TrailblazerBadge({ areaName, language }: TrailblazerBadgeProps) {
  const { language: currentLanguage } = useLanguage();
  const lang = currentLanguage || language;

  const subtitle =
    areaName && lang === 'es'
      ? `Primero en alojar una sesión en ${areaName}`
      : areaName
        ? `First to host a session in ${areaName}`
        : lang === 'es'
          ? 'Pionero en la comunidad'
          : 'Community pioneer';

  return (
    <div className="inline-flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-tribe-green-light to-lime-400 text-tribe-dark rounded-full font-semibold text-sm hover:shadow-lg transition-shadow group">
      <span className="text-base">🏔️</span>
      <div className="flex flex-col">
        <span className="leading-tight">{lang === 'es' ? 'Pionero' : 'Trailblazer'}</span>
        {areaName && <span className="text-xs opacity-75 group-hover:opacity-100 transition-opacity">{subtitle}</span>}
      </div>
    </div>
  );
}
