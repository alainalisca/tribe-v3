import { z } from 'zod';

export const createSessionSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  date: z.string(),
  time: z.string(),
  location_name: z.string().max(200).optional(),
  location_lat: z.number().optional(),
  location_lng: z.number().optional(),
  max_participants: z.number().int().positive().max(500).optional(),
  is_paid: z.boolean().optional(),
  price_cents: z.number().int().nonnegative().optional(),
  currency: z.enum(['COP', 'USD']).optional(),
  sport: z.string().max(100).optional(),
  is_recurring: z.boolean().optional(),
  recurrence_pattern: z.string().optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
