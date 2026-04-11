'use client';

import { Star, TrendingUp, Users, BarChart3, Ticket, Megaphone } from 'lucide-react';

interface Props {
  language: string;
}

export default function PartnerBenefits({ language }: Props) {
  const benefits =
    language === 'es'
      ? [
          { icon: <Star className="w-4 h-4" />, text: 'Insignia de Socio Destacado en tu perfil' },
          { icon: <TrendingUp className="w-4 h-4" />, text: 'Ubicación prioritaria en el feed de inicio' },
          { icon: <Users className="w-4 h-4" />, text: 'Vitrina mejorada con lista de instructores' },
          { icon: <BarChart3 className="w-4 h-4" />, text: 'Panel de analíticas en tiempo real' },
          { icon: <Megaphone className="w-4 h-4" />, text: 'Soporte para múltiples instructores' },
          { icon: <Ticket className="w-4 h-4" />, text: 'Códigos promocionales (próximamente)' },
        ]
      : [
          { icon: <Star className="w-4 h-4" />, text: 'Featured Partner badge on your profile' },
          { icon: <TrendingUp className="w-4 h-4" />, text: 'Priority placement in the home feed' },
          { icon: <Users className="w-4 h-4" />, text: 'Enhanced storefront with instructor roster' },
          { icon: <BarChart3 className="w-4 h-4" />, text: 'Real-time analytics dashboard' },
          { icon: <Megaphone className="w-4 h-4" />, text: 'Multi-instructor support' },
          { icon: <Ticket className="w-4 h-4" />, text: 'Promo codes (coming soon)' },
        ];

  return (
    <div className="mt-4 bg-white dark:bg-[#3D4349] rounded-2xl border border-stone-200 dark:border-[#52575D] p-5">
      <h3 className="text-base font-bold text-stone-900 dark:text-white mb-3">
        {language === 'es' ? 'Lo Que Obtienes' : 'What You Get'}
      </h3>
      <div className="grid grid-cols-1 gap-2.5">
        {benefits.map((b, i) => (
          <div key={i} className="flex items-center gap-2.5 text-tribe-green">
            {b.icon}
            <span className="text-sm text-stone-700 dark:text-[#E0E0E0]">{b.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
