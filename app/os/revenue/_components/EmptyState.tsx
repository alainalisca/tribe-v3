'use client';

/**
 * Empty state for the revenue dashboard when the instructor has zero
 * activity in the selected period (no payments, no refunds). Shown
 * with two CTAs: widen the date range, or create a paid session.
 */

import Link from 'next/link';
import { Receipt, Plus } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

interface Props {
  /** Called when the instructor wants to broaden the period (e.g. switch to "all time"). */
  onWiden: () => void;
  /** True when the current period is already "all time" so widening is meaningless. */
  alreadyAllTime?: boolean;
}

export default function EmptyState({ onWiden, alreadyAllTime }: Props): JSX.Element {
  const { language } = useLanguage();
  const s = COPY[language];

  return (
    <div className="rounded-2xl bg-tribe-surface border border-tribe-mid p-10 sm:p-14 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-tribe-mid mb-5">
        <Receipt className="w-6 h-6 text-white/70" />
      </div>
      <h2 className="text-xl sm:text-2xl font-black text-white mb-2">
        {alreadyAllTime ? s.emptyAllTimeTitle : s.emptyTitle}
      </h2>
      <p className="text-sm sm:text-base text-white/70 leading-relaxed max-w-md mx-auto mb-6">
        {alreadyAllTime ? s.emptyAllTimeHint : s.emptyHint}
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {!alreadyAllTime && (
          <button
            type="button"
            onClick={onWiden}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-tribe-mid text-white text-sm font-semibold rounded-lg hover:bg-tribe-mid/70 transition-colors"
          >
            {s.widenButton}
          </button>
        )}
        <Link
          href="/create"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-tribe-green text-tribe-dark text-sm font-bold rounded-lg shadow-[0_4px_20px_rgba(132,204,22,0.35)] hover:shadow-[0_6px_28px_rgba(132,204,22,0.5)] hover:-translate-y-0.5 transition-all"
        >
          <Plus className="w-4 h-4" />
          {s.createButton}
        </Link>
      </div>
    </div>
  );
}

const COPY = {
  en: {
    emptyTitle: 'No revenue in this period',
    emptyHint:
      'You did not have any paid bookings in the selected date range. Try widening the range, or create a paid session to start earning.',
    emptyAllTimeTitle: 'No revenue yet',
    emptyAllTimeHint:
      'You have not generated any revenue yet. Create a paid session and start earning. Your revenue will show up here as bookings come in.',
    widenButton: 'Try a wider range',
    createButton: 'Create a paid session',
  },
  // ES PENDING VERONICA REVIEW
  es: {
    emptyTitle: 'No hay ingresos en este período',
    emptyHint:
      'No tuviste reservas pagadas en el rango de fechas seleccionado. Prueba ampliando el rango o crea una sesión de pago para empezar a ganar.',
    emptyAllTimeTitle: 'Aún no has generado ingresos',
    emptyAllTimeHint:
      'Aún no has generado ingresos. Crea una sesión de pago y empieza a ganar. Tus ingresos aparecerán aquí a medida que lleguen las reservas.',
    widenButton: 'Probar un rango más amplio',
    createButton: 'Crear sesión de pago',
  },
} as const;
