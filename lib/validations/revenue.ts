import { z } from 'zod';

/**
 * Validation schemas for the /api/tribe-os/revenue/* endpoints.
 *
 * Shared semantics:
 *   - `from` / `to` are ISO 8601 dates (YYYY-MM-DD), inclusive on both
 *     ends. The DAL adds one day to `to` internally to match the SQL
 *     function's exclusive-end contract.
 *   - The range is capped at 366 days. Anything longer should be split.
 *   - Currency defaults to 'all' when absent.
 *   - The `MAX_RANGE_DAYS` constant lives here (rather than re-importing
 *     from DAL) so this file is purely a validator with no runtime deps
 *     on the DAL.
 */

const MAX_RANGE_DAYS = 366;

/** ISO 8601 date (YYYY-MM-DD). Stricter than z.coerce.date() because we
 *  want the wire format to match exactly what we pass to SQL. */
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .refine((s) => !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()), {
    message: 'not a valid calendar date',
  });

/** Differential check shared across all three endpoints: `to` cannot
 *  precede `from`, and the range cannot exceed 366 days. */
function refineRange(val: { from: string; to: string }, ctx: z.RefinementCtx) {
  if (val.to < val.from) {
    ctx.addIssue({
      code: 'custom',
      path: ['to'],
      message: `'to' (${val.to}) must be on or after 'from' (${val.from})`,
    });
    return;
  }
  const fromMs = new Date(`${val.from}T00:00:00Z`).getTime();
  const toMs = new Date(`${val.to}T00:00:00Z`).getTime();
  const spanDays = Math.round((toMs - fromMs) / (24 * 60 * 60 * 1000)) + 1;
  if (spanDays > MAX_RANGE_DAYS) {
    ctx.addIssue({
      code: 'custom',
      path: ['to'],
      message: `date range cannot exceed ${MAX_RANGE_DAYS} days (got ${spanDays})`,
    });
  }
}

// ----- Summary endpoint -----

export const revenueSummaryQuerySchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    currency: z.enum(['USD', 'COP', 'all']).optional().default('all'),
    groupBy: z.enum(['week', 'month']).optional(),
  })
  .superRefine(refineRange);

export type RevenueSummaryQuery = z.infer<typeof revenueSummaryQuerySchema>;

// ----- Payments list endpoint -----

export const revenuePaymentsQuerySchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    currency: z.enum(['USD', 'COP', 'all']).optional().default('all'),
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
    offset: z.coerce.number().int().min(0).optional().default(0),
    sort: z.enum(['date_desc', 'date_asc', 'amount_desc', 'amount_asc']).optional().default('date_desc'),
  })
  .superRefine(refineRange);

export type RevenuePaymentsQuery = z.infer<typeof revenuePaymentsQuerySchema>;

// ----- Export endpoint -----

export const revenueExportQuerySchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    format: z.enum(['csv']).optional().default('csv'),
  })
  .superRefine(refineRange);

export type RevenueExportQuery = z.infer<typeof revenueExportQuerySchema>;
