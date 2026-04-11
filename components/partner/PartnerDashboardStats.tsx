'use client';

import type { PartnerStats } from '@/lib/dal/featuredPartners';
import { Eye, MousePointer, CalendarCheck, DollarSign } from 'lucide-react';

interface Props {
  stats: PartnerStats;
  language: string;
}

export default function PartnerDashboardStats({ stats, language }: Props) {
  const t = (en: string, es: string) => (language === 'es' ? es : en);

  const cards = [
    {
      icon: <Eye className="w-5 h-5 text-tribe-green" />,
      value: stats.total_impressions.toLocaleString(),
      label: t('Feed Impressions', 'Impresiones en Feed'),
    },
    {
      icon: <MousePointer className="w-5 h-5 text-tribe-green" />,
      value: stats.total_clicks.toLocaleString(),
      label: t('Storefront Views', 'Visitas a Vitrina'),
    },
    {
      icon: <CalendarCheck className="w-5 h-5 text-tribe-green" />,
      value: stats.total_bookings.toLocaleString(),
      label: t('Total Bookings', 'Total Reservas'),
    },
    {
      icon: <DollarSign className="w-5 h-5 text-tribe-green" />,
      value: stats.revenue_cents > 0 ? `$${(stats.revenue_cents / 100).toLocaleString()}` : '$0',
      label: t('Revenue', 'Ingresos'),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 mb-5">
      {cards.map((card, i) => (
        <div
          key={i}
          className="bg-white dark:bg-[#3D4349] rounded-2xl border border-stone-200 dark:border-[#52575D] p-4"
        >
          <div className="flex items-center gap-2 mb-2">{card.icon}</div>
          <div className="text-2xl font-extrabold text-stone-900 dark:text-white">{card.value}</div>
          <div className="text-xs text-stone-500 dark:text-[#B1B3B6] mt-0.5">{card.label}</div>
        </div>
      ))}
    </div>
  );
}
