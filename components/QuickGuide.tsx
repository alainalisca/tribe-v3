'use client';

/**
 * Generic multi-step quick-guide modal.
 *
 * Used for optional, dismissible feature tours — the kind of "here's
 * where the four key things are" walkthrough you'd show a user the
 * first time they land on a complex surface. Different from the
 * onboarding form: this is content-only, no inputs, no required
 * completion.
 *
 * Drop in:
 *
 *   const guide = useQuickGuide('tribe-os-welcome');
 *   return (
 *     <>
 *       ...page content...
 *       <QuickGuide
 *         id="tribe-os-welcome"
 *         open={guide.open}
 *         onClose={guide.close}
 *         steps={tribeOsWelcomeSteps[language]}
 *       />
 *     </>
 *   );
 *
 * Auto-show on first visit is handled by the hook (useQuickGuide).
 * The hook also exposes `replay()` so a "Take the tour again" link
 * can re-open the guide without unsetting the seen flag.
 *
 * Visual style: dark surface, brand-token-colored, mobile-first
 * full-screen sheet that becomes a centered modal on sm+ screens.
 * Keeps the visual weight of the rest of Tribe.OS.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

export interface QuickGuideStep {
  /** Optional Lucide icon component for the step header. */
  Icon?: React.ComponentType<{ className?: string }>;
  /** Short title — 4–6 words, sentence case. */
  title: string;
  /** One-paragraph body. Keep under ~200 chars. */
  body: ReactNode;
}

interface QuickGuideProps {
  /** Stable identifier — same as the one passed to useQuickGuide. */
  id: string;
  /** Controlled open state from the hook. */
  open: boolean;
  /** Called when the user dismisses, finishes, or hits Escape. */
  onClose: () => void;
  /** The steps to render, in order. */
  steps: readonly QuickGuideStep[];
}

const copy = {
  en: {
    skip: 'Skip',
    next: 'Next',
    back: 'Back',
    done: 'Got it',
    progressLabel: (current: number, total: number) => `Step ${current} of ${total}`,
    closeLabel: 'Close',
  },
  // ES PENDING VERONICA REVIEW
  es: {
    skip: 'Saltar',
    next: 'Siguiente',
    back: 'Atrás',
    done: 'Listo',
    progressLabel: (current: number, total: number) => `Paso ${current} de ${total}`,
    closeLabel: 'Cerrar',
  },
} as const;

export default function QuickGuide({ id, open, onClose, steps }: QuickGuideProps) {
  const { language } = useLanguage();
  const s = copy[language];
  const [index, setIndex] = useState(0);

  // Reset to step 1 every time the modal opens. Otherwise users
  // re-running the tour would land mid-flow on the last step.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  // Escape closes. Browsers don't auto-do this for arbitrary divs;
  // important for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Body scroll lock while the guide is open — prevents the page
  // behind from scrolling on mobile if the user pans.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;
  if (steps.length === 0) return null;

  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  const goNext = () => {
    if (isLast) {
      onClose();
    } else {
      setIndex((i) => Math.min(i + 1, steps.length - 1));
    }
  };
  const goBack = () => setIndex((i) => Math.max(i - 1, 0));

  const Icon = step.Icon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title-${index}`}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      {/* Scrim */}
      <button
        type="button"
        aria-label={s.closeLabel}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* Panel — mobile: bottom sheet. Desktop: centered card. */}
      <div className="relative w-full sm:max-w-md bg-tribe-dark border border-tribe-mid rounded-t-3xl sm:rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] pt-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] sm:pb-6 px-6">
        {/* Top row: progress + close */}
        <div className="flex items-center justify-between mb-5">
          <p
            aria-label={s.progressLabel(index + 1, steps.length)}
            className="text-[10px] uppercase tracking-[0.12em] font-bold text-white/50"
          >
            {s.progressLabel(index + 1, steps.length)}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label={s.closeLabel}
            className="text-white/50 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mb-6" aria-hidden="true">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === index ? 'flex-[3] bg-tribe-green' : 'flex-1 bg-tribe-mid'
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[180px]">
          {Icon ? (
            <div className="w-12 h-12 rounded-2xl bg-tribe-green/15 text-tribe-green flex items-center justify-center mb-4">
              <Icon className="w-6 h-6" />
            </div>
          ) : null}
          <h2
            id={`${id}-title-${index}`}
            className="text-xl sm:text-2xl font-black text-white tracking-tight leading-tight mb-2"
          >
            {step.title}
          </h2>
          <div className="text-sm sm:text-base text-white/80 leading-relaxed">{step.body}</div>
        </div>

        {/* Footer actions */}
        <div className="mt-6 flex items-center justify-between gap-3">
          {/* Left: Back or Skip */}
          {isFirst ? (
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-semibold text-white/60 hover:text-white transition-colors"
            >
              {s.skip}
            </button>
          ) : (
            <button
              type="button"
              onClick={goBack}
              className="inline-flex items-center gap-1 text-sm font-semibold text-white/60 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              {s.back}
            </button>
          )}

          {/* Right: Next or Done */}
          <button
            type="button"
            onClick={goNext}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-tribe-green text-tribe-dark text-sm font-bold rounded-full shadow-[0_4px_20px_rgba(132,204,22,0.35)] hover:shadow-[0_6px_28px_rgba(132,204,22,0.5)] hover:-translate-y-0.5 transition-all"
          >
            {isLast ? (
              <>
                <Check className="w-4 h-4" />
                {s.done}
              </>
            ) : (
              <>
                {s.next}
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
