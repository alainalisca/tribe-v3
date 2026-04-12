'use client';

import { Eye, Target, DollarSign, Users, BarChart3 } from 'lucide-react';

interface Props {
  language: string;
}

const getCards = (language: string) => [
  {
    icon: <Eye className="w-6 h-6 text-tribe-green" />,
    title: language === 'es' ? 'Ubicación Prioritaria en el Feed' : 'Priority Feed Placement',
    desc: language === 'es' ? '5x más visibilidad que listados regulares' : '5x more visibility than regular listings',
    stat: '5x',
  },
  {
    icon: <Target className="w-6 h-6 text-tribe-green" />,
    title: language === 'es' ? 'Alcance de Atletas Enfocado' : 'Targeted Athlete Reach',
    desc:
      language === 'es'
        ? 'Atletas activos en tu zona te encuentran primero'
        : 'Active athletes in your area find you first',
    stat: '500+',
  },
  {
    icon: <DollarSign className="w-6 h-6 text-tribe-green" />,
    title: language === 'es' ? 'Reservas e Ingresos Directos' : 'Direct Bookings & Revenue',
    desc: language === 'es' ? '85% de cada reserva va directamente a ti' : '85% of every booking goes directly to you',
    stat: '85%',
  },
  {
    icon: <Users className="w-6 h-6 text-tribe-green" />,
    title: language === 'es' ? 'Construye Tu Base de Atletas' : 'Build Your Athlete Base',
    desc:
      language === 'es' ? '68% tasa de retorno promedio entre afiliados' : '68% average return rate among affiliates',
    stat: '68%',
  },
  {
    icon: <BarChart3 className="w-6 h-6 text-tribe-green" />,
    title: language === 'es' ? 'Analíticas en Tiempo Real' : 'Real-Time Analytics',
    desc:
      language === 'es'
        ? 'Rastrea impresiones, reservas e ingresos al instante'
        : 'Track impressions, bookings, and revenue instantly',
    stat: '24/7',
  },
];

export default function PartnerValueCards({ language }: Props) {
  const cards = getCards(language);

  return (
    <div className="space-y-3">
      {cards.map((card, i) => (
        <div
          key={i}
          className="bg-white dark:bg-[#3D4349] rounded-2xl border border-stone-200 dark:border-[#52575D] p-4 flex gap-4 items-start"
        >
          <div className="flex-shrink-0 w-12 h-12 bg-tribe-green/10 rounded-xl flex items-center justify-center">
            {card.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-stone-900 dark:text-white">{card.title}</h3>
              <span className="text-lg font-extrabold text-tribe-green flex-shrink-0">{card.stat}</span>
            </div>
            <p className="text-xs text-stone-500 dark:text-[#B1B3B6] mt-0.5">{card.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
