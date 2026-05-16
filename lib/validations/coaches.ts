/**
 * Zod schemas for the coach management API.
 *
 * Mirrors the constraints on `gym_coaches`:
 *   - role IN ('owner','coach','assistant') — but the API never
 *     accepts 'owner' from a caller; the owner is the gym creator
 *     and changes only through an explicit ownership-transfer
 *     flow (not built yet).
 *
 * Email format is enforced here so we can give a clear 400 rather
 * than a Postgres error from the user lookup.
 */
import { z } from 'zod';

export const InviteCoachInputSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email format').max(254, 'Email is too long'),
  role: z.enum(['coach', 'assistant']).optional(),
});
export type InviteCoachInput = z.infer<typeof InviteCoachInputSchema>;

export const RemoveCoachInputSchema = z.object({
  user_id: z.string().uuid('user_id must be a UUID'),
});
export type RemoveCoachInput = z.infer<typeof RemoveCoachInputSchema>;
