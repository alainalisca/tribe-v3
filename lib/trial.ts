/**
 * Instructor Free Trial Logic
 *
 * All instructor monetization features (Boosts, Pro Storefront) are free
 * for the first 3 months after the instructor signs up. After that,
 * payment is required.
 *
 * The trial period is determined by the `instructor_since` timestamp
 * on the users table, which is set when the instructor completes
 * the onboarding wizard (/onboarding/instructor).
 */

export const TRIAL_DURATION_DAYS = 90; // 3 months

export interface TrialStatus {
  /** Whether the instructor is currently within the free trial period */
  isInTrial: boolean;
  /** Days remaining in the trial (0 if expired) */
  daysRemaining: number;
  /** When the trial started (instructor_since timestamp) */
  trialStartDate: Date | null;
  /** When the trial ends */
  trialEndDate: Date | null;
  /** Human-readable label for the trial status */
  label: string;
}

/**
 * Calculate the trial status for an instructor.
 *
 * @param instructorSince - The ISO date string when the instructor signed up.
 *   Comes from the `instructor_since` column on the users table.
 * @param language - 'en' or 'es' for localized labels.
 * @returns TrialStatus object with all relevant trial information.
 *
 * How it works:
 * - If `instructorSince` is null/undefined, the user isn't an instructor → not in trial.
 * - Otherwise, add 90 days to the signup date and compare to now.
 * - If now < trialEnd → in trial, with daysRemaining calculated.
 * - If now >= trialEnd → trial expired.
 */
export function getTrialStatus(
  instructorSince: string | null | undefined,
  language: 'en' | 'es' = 'en'
): TrialStatus {
  // No instructor_since means not an instructor or legacy account
  if (!instructorSince) {
    return {
      isInTrial: false,
      daysRemaining: 0,
      trialStartDate: null,
      trialEndDate: null,
      label: language === 'es' ? 'Sin período de prueba' : 'No trial period',
    };
  }

  const startDate = new Date(instructorSince);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + TRIAL_DURATION_DAYS);

  const now = new Date();
  const diffMs = endDate.getTime() - now.getTime();
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const isInTrial = diffMs > 0;

  let label: string;
  if (isInTrial) {
    label = language === 'es'
      ? `Prueba gratis: ${daysRemaining} días restantes`
      : `Free trial: ${daysRemaining} days remaining`;
  } else {
    label = language === 'es'
      ? 'Período de prueba terminado'
      : 'Trial period ended';
  }

  return {
    isInTrial,
    daysRemaining,
    trialStartDate: startDate,
    trialEndDate: endDate,
    label,
  };
}

/**
 * Check whether a feature requires payment or is still free under the trial.
 *
 * Use this as a gate before showing a payment wall:
 *   - If true, the feature is free → skip payment flow.
 *   - If false, the feature requires payment → show Stripe/Wompi checkout.
 *
 * @param instructorSince - The ISO date string from users.instructor_since
 * @returns true if the instructor is within the free trial period
 */
export function isFeatureFree(instructorSince: string | null | undefined): boolean {
  return getTrialStatus(instructorSince).isInTrial;
}
