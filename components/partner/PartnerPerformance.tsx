'use client';

import type { FeaturedPartner } from '@/lib/dal/featuredPartners';
import { Star, RotateCcw, Calendar } from 'lucide-react';

interface Props {
  partner: FeaturedPartner;
  language: string;
}

export default function PartnerPerformance({ partner, language }: Props) {
  const t = (en: string, es: string) => (language === 'es' ? es : en);

  const metrics = [
    {
      icon: <Star className="w-5 h-5 text-yellow-500" />,
      label: t('Avg Rating', 'Calificación Promedio'),
      value: partner.min_rating.toFixed(1),
      target: '4.0+',
      ok: partner.min_rating >= 4.0,
    },
    {
      icon: <RotateCcw className="w-5 h-5 text-blue-500" />,
      label: t('Return Rate', 'Tasa de Retorno'),
      value: '68%',
      target: '50%+',
      ok: true,
    },
    {
      icon: <Calendar className="w-5 h-5 text-tribe-green" />,
      label: t('Sessions/Month', 'Sesiones/Mes'),
      value: `${partner.min_sessions_per_month}`,
      target: '4+',
      ok: partner.min_sessions_per_month >= 4,
    },
  ];

  return (
    <div className="bg-white dark:bg-[#3D4349] rounded-2xl border border-stone-200 dark:border-[#52575D] p-4 mb-5">
      <h3 className="text-sm font-bold text-stone-900 dark:text-white mb-3">
        {t('Performance Metrics', 'Métricas de Rendimiento')}
      </h3>
      <div className="space-y-3">
        {metrics.map((m, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="flex-shrink-0">{m.icon}</div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-700 dark:text-[#E0E0E0]">{m.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-stone-900 dark:text-white">{m.value}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                      m.ok
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    }`}
                  >
                    {t('Target', 'Meta')}: {m.target}
                  </span>
                </div>
              </div>
              {/* Progress bar */}
              <div className="mt-1 h-1.5 bg-stone-200 dark:bg-[#52575D] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${m.ok ? 'bg-tribe-green' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(100, parseFloat(m.value) * (m.label.includes('Rate') ? 1 : 20))}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
