'use client';

import { CheckCircle } from 'lucide-react';

interface Props {
  language: string;
}

export default function PartnerRequirements({ language }: Props) {
  const requirements =
    language === 'es'
      ? [
          '4+ sesiones publicadas por mes',
          'Mantener listados actualizados y precisos',
          'Responder a reservas dentro de 24 horas',
          'Mantener calificación de 4.0+ estrellas',
        ]
      : [
          '4+ sessions posted per month',
          'Keep listings updated and accurate',
          'Respond to bookings within 24 hours',
          'Maintain a 4.0+ star rating',
        ];

  return (
    <div className="mt-6 bg-white dark:bg-tribe-surface rounded-2xl border border-stone-200 dark:border-tribe-mid p-5">
      <h3 className="text-base font-bold text-stone-900 dark:text-white mb-3">
        {language === 'es' ? 'Requisitos' : 'Requirements'}
      </h3>
      <ul className="space-y-2.5">
        {requirements.map((req, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <CheckCircle className="w-4 h-4 text-tribe-green flex-shrink-0 mt-0.5" />
            <span className="text-sm text-stone-700 dark:text-gray-200">{req}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
