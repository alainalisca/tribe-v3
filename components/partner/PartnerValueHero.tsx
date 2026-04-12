'use client';

import { Star } from 'lucide-react';

interface Props {
  language: string;
}

export default function PartnerValueHero({ language }: Props) {
  return (
    <div className="text-center py-8">
      <div className="inline-flex items-center gap-1.5 bg-tribe-green/15 border border-tribe-green/30 text-tribe-green text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wide mb-4">
        <Star className="w-3.5 h-3.5 fill-tribe-green" />
        {language === 'es' ? 'Programa de Afiliados' : 'Affiliate Program'}
      </div>
      <h2 className="text-2xl font-extrabold text-stone-900 dark:text-white leading-tight mb-3">
        {language === 'es'
          ? 'Haz Crecer Tu Negocio con el Estatus de Afiliado Destacado'
          : 'Grow Your Business with Featured Affiliate Status'}
      </h2>
      <p className="text-sm text-stone-600 dark:text-[#B1B3B6] leading-relaxed max-w-md mx-auto">
        {language === 'es'
          ? 'Conecta con atletas activos, llena tus sesiones y construye tu marca en la plataforma de fitness de mayor crecimiento en Medellín.'
          : 'Connect with active athletes, fill your sessions, and build your brand on the fastest-growing fitness platform in Medellín.'}
      </p>
    </div>
  );
}
