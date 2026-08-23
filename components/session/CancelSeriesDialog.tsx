'use client';

/**
 * CancelSeriesDialog — a three-option sheet for cancelling a session that
 * belongs to a recurring series. ConfirmProvider's useConfirm is two-button
 * only, so this needs its own component (T-RECUR1 Gate 7).
 *
 * A child occurrence offers both "cancel this session" and "end the whole
 * series"; a parent (the template) offers only "end series" (there is no single
 * occurrence to cancel — its own date is the seed). Both always offer Back.
 */

import { XCircle, Repeat, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CancelSeriesDialogProps {
  open: boolean;
  /** True when the row is the series template (a parent), false for an occurrence. */
  isParent: boolean;
  language: 'en' | 'es';
  onCancelOne: () => void;
  onEndSeries: () => void;
  onClose: () => void;
}

export default function CancelSeriesDialog({
  open,
  isParent,
  language,
  onCancelOne,
  onEndSeries,
  onClose,
}: CancelSeriesDialogProps) {
  if (!open) return null;

  const es = language === 'es';
  const copy = {
    title: isParent
      ? es
        ? '¿Terminar esta serie?'
        : 'End this series?'
      : es
        ? '¿Qué quieres cancelar?'
        : 'What do you want to cancel?',
    cancelThisOccurrence: es ? 'Cancelar esta sesión' : 'Cancel this session',
    cancelThisOccurrenceDesc: es ? 'Solo esta fecha. La serie continúa.' : 'Only this date. The series continues.',
    endSeries: es ? 'Terminar toda la serie' : 'End the whole series',
    endSeriesDesc: es
      ? 'Se cancelan las sesiones futuras de esta serie y no se crearán más. Las sesiones pasadas no se tocan.'
      : 'Future sessions in this series are cancelled and no more will be created. Past sessions are untouched.',
    back: es ? 'Volver' : 'Back',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={copy.title}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-theme-card border border-theme p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-theme-primary">{copy.title}</h2>
          <button type="button" onClick={onClose} aria-label={copy.back} className="p-1 -m-1 text-theme-secondary">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cancel just this occurrence — only meaningful for a child. */}
        {!isParent && (
          <button
            type="button"
            onClick={onCancelOne}
            className="w-full text-left rounded-xl border border-theme p-3 hover:border-tribe-green transition"
          >
            <span className="flex items-center gap-2 font-semibold text-theme-primary">
              <XCircle className="w-4 h-4 text-tribe-red" />
              {copy.cancelThisOccurrence}
            </span>
            <span className="block text-xs text-theme-secondary mt-1">{copy.cancelThisOccurrenceDesc}</span>
          </button>
        )}

        {/* End the whole series. */}
        <button
          type="button"
          onClick={onEndSeries}
          className="w-full text-left rounded-xl border border-theme p-3 hover:border-tribe-red transition"
        >
          <span className="flex items-center gap-2 font-semibold text-theme-primary">
            <Repeat className="w-4 h-4 text-tribe-red" />
            {copy.endSeries}
          </span>
          <span className="block text-xs text-theme-secondary mt-1">{copy.endSeriesDesc}</span>
        </button>

        <Button variant="outline" className="w-full" onClick={onClose}>
          {copy.back}
        </Button>
      </div>
    </div>
  );
}
