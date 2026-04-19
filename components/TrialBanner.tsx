'use client';

import { getTrialStatus, type TrialStatus } from '@/lib/trial';
import { useLanguage } from '@/lib/LanguageContext';
import { Clock, Gift, AlertTriangle } from 'lucide-react';

interface TrialBannerProps {
  instructorSince: string | null | undefined;
  /** Compact mode for inline display (e.g., inside boost form) */
  compact?: boolean;
}

/**
 * TrialBanner — Displays the instructor's free trial status.
 *
 * Shows differently depending on the trial state:
 * - Active trial (>30 days left): Green banner with gift icon + days remaining
 * - Active trial (≤30 days left): Amber warning banner with urgency
 * - Expired trial: No banner (payment flow takes over)
 *
 * Usage:
 *   <TrialBanner instructorSince={user.instructor_since} />
 *   <TrialBanner instructorSince={user.instructor_since} compact />
 */
export default function TrialBanner({ instructorSince, compact = false }: TrialBannerProps) {
  const { language } = useLanguage();
  const trial = getTrialStatus(instructorSince, language);

  // Don't show anything if trial is over or user isn't an instructor
  if (!trial.isInTrial || !trial.trialStartDate) return null;

  const isUrgent = trial.daysRemaining <= 30;

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
          isUrgent
            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
            : 'bg-tribe-green/15 text-tribe-green'
        }`}
      >
        {isUrgent ? <AlertTriangle className="w-3 h-3" /> : <Gift className="w-3 h-3" />}
        {language === 'es'
          ? `Gratis — ${trial.daysRemaining} días`
          : `Free — ${trial.daysRemaining} days`}
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl p-4 border ${
        isUrgent
          ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700/50'
          : 'bg-tribe-green/10 border-tribe-green/30'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            isUrgent
              ? 'bg-amber-100 dark:bg-amber-800/40'
              : 'bg-tribe-green/20'
          }`}
        >
          {isUrgent ? (
            <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          ) : (
            <Gift className="w-5 h-5 text-tribe-green" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3
            className={`text-sm font-bold ${
              isUrgent
                ? 'text-amber-800 dark:text-amber-300'
                : 'text-tribe-green'
            }`}
          >
            {isUrgent
              ? language === 'es'
                ? `¡Tu prueba gratis termina en ${trial.daysRemaining} días!`
                : `Your free trial ends in ${trial.daysRemaining} days!`
              : language === 'es'
                ? 'Período de prueba gratis activo'
                : 'Free trial active'}
          </h3>
          <p className="text-xs text-theme-secondary mt-1">
            {isUrgent
              ? language === 'es'
                ? 'Después de la prueba, los boosts y la vitrina Pro requerirán pago.'
                : 'After your trial, boosts and Pro storefront will require payment.'
              : language === 'es'
                ? `Todos los features premium son gratis por ${trial.daysRemaining} días más. ¡Disfruta!`
                : `All premium features are free for ${trial.daysRemaining} more days. Enjoy!`}
          </p>
        </div>
      </div>
    </div>
  );
}
