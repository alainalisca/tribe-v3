'use client';

import { useTranslations } from '@/lib/i18n/useTranslations';
import { ERROR_MESSAGE_KEY, MAX_ATHLETES, MIN_ATHLETES, type SessionFieldError } from '@/lib/sessions/sessionFormRules';

/** A rules-module error code, in the reader's language. */
export function useFieldErrorText(): (error: SessionFieldError | undefined) => string | undefined {
  const t = useTranslations('sessionForm');
  return (error) => (error ? t(ERROR_MESSAGE_KEY[error], { min: MIN_ATHLETES, max: MAX_ATHLETES }) : undefined);
}
