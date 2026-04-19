import { z } from 'zod';

export const createPaymentSchema = z.object({
  type: z.enum(['session', 'boost_campaign', 'pro_storefront']),
  session_id: z.string().uuid().optional(),
  boost_campaign_id: z.string().uuid().optional(),
  currency: z.enum(['COP', 'USD']).optional(),
  promo_code: z.string().max(50).optional(),
  redirect_url: z.string().url().optional(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
