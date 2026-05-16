/**
 * Zod schemas for the gym teams API.
 *
 * Mirrors the constraints on gym_teams:
 *   - name 1–80 chars
 *   - description nullable, up to 500 chars
 *   - color in the enum supported by the CHECK constraint
 *   - coach_user_id is a UUID or null
 */
import { z } from 'zod';

export const TEAM_COLORS = ['lime', 'blue', 'amber', 'red', 'purple', 'slate'] as const;

export const CreateTeamInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80, 'Name is too long'),
  description: z.string().trim().max(500, 'Description is too long').nullable().optional(),
  color: z.enum(TEAM_COLORS).optional(),
  coach_user_id: z.string().uuid('coach_user_id must be a UUID').nullable().optional(),
});
export type CreateTeamInput = z.infer<typeof CreateTeamInputSchema>;

export const UpdateTeamInputSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  color: z.enum(TEAM_COLORS).optional(),
  coach_user_id: z.string().uuid().nullable().optional(),
});
export type UpdateTeamInput = z.infer<typeof UpdateTeamInputSchema>;

export const TeamMembershipInputSchema = z.object({
  client_id: z.string().uuid('client_id must be a UUID'),
});
export type TeamMembershipInput = z.infer<typeof TeamMembershipInputSchema>;
