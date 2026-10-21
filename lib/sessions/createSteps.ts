/**
 * T-POLISH1 PR 4b: the three steps of /create and which fields each owns.
 * The step lives in the URL (?paso=N) so the phone's back button walks the
 * steps; these helpers read it and decide where a failed publish lands.
 */

import { STEP_FIELDS, type SessionFieldErrors, type SessionFormField, type SessionFormStep } from './sessionFormRules';

export type CreateStep = 1 | 2 | 3;

export const STEP_NAMES: Record<CreateStep, SessionFormStep> = {
  1: 'what',
  2: 'when_where',
  3: 'capacity',
};

/** ?paso= as a step; anything else is step 1. */
export function parseStep(value: string | null | undefined): CreateStep {
  return value === '2' ? 2 : value === '3' ? 3 : 1;
}

/** The step a rules field is shown on. */
export function stepOfField(field: SessionFormField): CreateStep {
  for (const step of [1, 2, 3] as const) if (STEP_FIELDS[STEP_NAMES[step]].includes(field)) return step;
  return 1;
}

/**
 * The first step with something to fix, for Publicar. Paid-block errors live
 * on step 3, after the rules' own fields. null when nothing fails.
 */
export function firstFailingStep(errors: SessionFieldErrors, paidFailed: boolean): CreateStep | null {
  const steps = (Object.keys(errors) as SessionFormField[]).filter((f) => errors[f]).map(stepOfField);
  if (paidFailed) steps.push(3);
  return steps.length ? (Math.min(...steps) as CreateStep) : null;
}

/** Only the errors of one step, so "Siguiente" never blocks on a later step. */
export function errorsForStep(errors: SessionFieldErrors, step: CreateStep): SessionFieldErrors {
  const out: SessionFieldErrors = {};
  for (const field of STEP_FIELDS[STEP_NAMES[step]]) if (errors[field]) out[field] = errors[field];
  return out;
}
