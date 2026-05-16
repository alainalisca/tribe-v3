'use client';

/**
 * First-visit guide for /os/revenue. Three steps covering the
 * surfaces a new instructor wouldn't immediately understand without
 * a tour:
 *
 *   1. Period selector — what "This week" / "This month" / etc.
 *      means, plus the custom range option
 *   2. Summary cards — gross vs fees vs refunds vs net, why those
 *      four numbers exist separately
 *   3. CSV export — for tax season
 */

import { useEffect } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { Calendar, BarChart3, Download } from 'lucide-react';
import QuickGuide, { type QuickGuideStep } from '@/components/QuickGuide';
import { useQuickGuide } from '@/hooks/useQuickGuide';

const GUIDE_ID = 'tribe-os-revenue-welcome';

interface RevenuePageGuideProps {
  enabled?: boolean;
  onReplayRef?: (replay: () => void) => void;
}

// ES PENDING VERONICA REVIEW
const stepsByLanguage = {
  en: [
    {
      Icon: Calendar,
      title: 'Pick the period you want to see',
      body: 'The pills at the top — This week, This month, Last month, Last 90 days, Year to date, All time, Custom — set the date range for everything on this page. Defaults to this month.',
    },
    {
      Icon: BarChart3,
      title: 'Four numbers that matter',
      body: 'Gross is what came in. Platform fees are what Tribe took. Refunds are what went back. Net is what you keep. Each currency (USD, COP) gets its own card if you have activity in both.',
    },
    {
      Icon: Download,
      title: 'Export to CSV when tax season hits',
      body: 'The Export button hands you a spreadsheet with every payment in the selected period. Includes timestamps, amounts, fees, and Stripe IDs — everything an accountant asks for.',
    },
  ],
  es: [
    {
      Icon: Calendar,
      title: 'Elige el período que quieres ver',
      body: 'Las píldoras de arriba — Esta semana, Este mes, Mes pasado, Últimos 90 días, Año en curso, Todo el tiempo, Personalizado — definen el rango de fechas para toda la página. Por defecto es este mes.',
    },
    {
      Icon: BarChart3,
      title: 'Cuatro números que importan',
      body: 'Bruto es lo que entró. Comisiones son lo que tomó Tribe. Reembolsos son lo que devolviste. Neto es lo que te queda. Cada moneda (USD, COP) tiene su propia tarjeta si tienes actividad en ambas.',
    },
    {
      Icon: Download,
      title: 'Exporta a CSV cuando llegue la temporada de impuestos',
      body: 'El botón Exportar te entrega una hoja de cálculo con cada pago del período seleccionado. Incluye fechas, montos, comisiones e IDs de Stripe — todo lo que un contador pide.',
    },
  ],
} as const satisfies Record<'en' | 'es', readonly QuickGuideStep[]>;

export default function RevenuePageGuide({ enabled = true, onReplayRef }: RevenuePageGuideProps) {
  const { language } = useLanguage();
  const guide = useQuickGuide(GUIDE_ID, { enabled, autoOpen: true });

  useEffect(() => {
    onReplayRef?.(guide.replay);
  }, [onReplayRef, guide.replay]);

  return <QuickGuide id={GUIDE_ID} open={guide.open} onClose={guide.close} steps={stepsByLanguage[language]} />;
}
