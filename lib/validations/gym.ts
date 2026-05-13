/**
 * Zod schemas for the Tribe.OS gym settings API.
 *
 * Mirrors the column constraints on public.gyms (migration 068):
 *   - name 1..255 chars
 *   - timezone any non-empty string (IANA validation deferred to the
 *     browser's Intl support; an invalid TZ surfaces as a 500 from
 *     downstream queries, not a 400 here)
 *   - default_currency in ('USD', 'COP') or null
 */

import { z } from 'zod';

const currencySchema = z.enum(['USD', 'COP']);

export const UpdateGymInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Gym name is required')
      .max(255, 'Gym name must be 255 characters or fewer')
      .optional(),
    timezone: z.string().trim().min(1, 'Timezone must not be empty').max(64, 'Timezone is too long').optional(),
    default_currency: currencySchema.nullable().optional(),
    // Per-gym opt-in for the nightly insight digest email. Defaults
    // true in the DB (migration 081); patching this flips it off.
    intelligence_email_enabled: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });
export type UpdateGymInput = z.infer<typeof UpdateGymInputSchema>;
