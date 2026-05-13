'use client';

import { Brain } from 'lucide-react';
import ComingSoonPage from '@/components/tribe-os/ComingSoonPage';

export default function IntelligencePage() {
  return (
    <ComingSoonPage
      Icon={Brain}
      title={{ en: 'Intelligence', es: 'Inteligencia' }}
      description={{
        en: 'Retention cohorts, revenue trends, churn predictors, and gym-level insights pulled together so you can spot what is working and what is not.',
        es: 'Cohortes de retención, tendencias de ingresos, predicción de bajas e insights del gym, todo en un solo lugar para ver qué funciona y qué no.',
      }}
    />
  );
}
