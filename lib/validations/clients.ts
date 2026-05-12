/**
 * Zod schemas for the Tribe.OS clients + attendance API surface.
 *
 * The DB enforces structural integrity (CHECK constraints from migration
 * 062, RLS scoping). These schemas enforce input shape — the right
 * layer for "this string is too long", "this enum value isn't allowed",
 * "these payment fields must be set together".
 *
 * Per-tag char length lives here (not in the DB) because Postgres
 * forbids subqueries in CHECK constraints; the DB caps the array
 * count at 20, this layer caps individual tags at 1..30 chars.
 */

import { z } from 'zod';

// ------------------------------------------------------------------
// Shared sub-schemas
// ------------------------------------------------------------------

/**
 * Tag rule: 1..30 chars, no leading/trailing whitespace. Up to 10
 * per client (the DB allows up to 20 as a safety margin; we keep the
 * UX-friendly cap here so adding tags doesn't become a chore).
 */
const tagSchema = z.string().trim().min(1, 'Tag must not be empty').max(30, 'Tag must be 30 characters or fewer');

const tagsSchema = z.array(tagSchema).max(10, 'A client can have at most 10 tags').optional();

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Invalid email format')
  .max(254, 'Email is too long')
  .nullable()
  .optional();

const phoneSchema = z.string().trim().max(30, 'Phone must be 30 characters or fewer').nullable().optional();

const notesSchema = z.string().max(2000, 'Notes must be 2000 characters or fewer').nullable().optional();

const contactInfoSchema = z.record(z.string(), z.unknown()).nullable().optional();

/**
 * Engagement status (migration 072). Mirrors the CHECK constraint on
 * clients.status. Defaults to 'active' at DB level — schema makes the
 * field optional on create so omitting it just falls through to the
 * default.
 */
const statusSchema = z.enum(['active', 'inactive', 'lead', 'lapsed']);

/**
 * Health notes (migration 072). Free-form, up to 4000 chars. Distinct
 * from the catch-all `notes` field — purpose-built for medical /
 * injury / restriction metadata.
 */
const healthNotesSchema = z.string().max(4000, 'Health notes must be 4000 characters or fewer').nullable().optional();

// ------------------------------------------------------------------
// Client create / update
// ------------------------------------------------------------------

export const CreateClientInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be 120 characters or fewer'),
  email: emailSchema,
  phone: phoneSchema,
  notes: notesSchema,
  tags: tagsSchema,
  contact_info: contactInfoSchema,
  status: statusSchema.optional(),
  health_notes: healthNotesSchema,
});
export type CreateClientInput = z.infer<typeof CreateClientInputSchema>;

/**
 * Update is partial: any field can be omitted. We require at least one
 * field be present so a no-op PATCH never reaches the DAL.
 */
export const UpdateClientInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: emailSchema,
    phone: phoneSchema,
    notes: notesSchema,
    tags: tagsSchema,
    contact_info: contactInfoSchema,
    archived: z.boolean().optional(),
    status: statusSchema.optional(),
    health_notes: healthNotesSchema,
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });
export type UpdateClientInput = z.infer<typeof UpdateClientInputSchema>;

// ------------------------------------------------------------------
// Attendance
// ------------------------------------------------------------------

const currencySchema = z.enum(['USD', 'COP']);
const paymentMethodSchema = z.enum(['cash', 'transfer', 'stripe', 'other']);

/**
 * Payment fields are co-required (DB-level CHECK
 * `attendance_payment_consistency`). Zod refinement enforces the
 * all-or-nothing invariant before the request hits the DB so we get a
 * clean 400 with a friendly message instead of a Postgres CHECK
 * violation surfacing through PostgREST.
 *
 * `paid_implies_amount` (DB-level): when `paid` is true,
 * `amount_paid_cents` must be set and positive. Mirrored here too.
 *
 * Note: `client_id` is NOT in this schema — it comes from the URL
 * param on the route. `session_id` IS in the body.
 */
export const RecordAttendanceInputSchema = z
  .object({
    session_id: z.string().uuid('session_id must be a UUID'),
    attended: z.boolean(),
    paid: z.boolean(),
    attended_at: z.string().datetime({ offset: true }).nullable().optional(),
    notes: z.string().max(2000, 'Notes must be 2000 characters or fewer').nullable().optional(),
    amount_paid_cents: z.number().int().min(0).nullable().optional(),
    currency: currencySchema.nullable().optional(),
    payment_method: paymentMethodSchema.nullable().optional(),
  })
  .refine(
    (data) => {
      const hasAmount = data.amount_paid_cents != null;
      const hasCurrency = data.currency != null;
      const hasMethod = data.payment_method != null;
      const allSet = hasAmount && hasCurrency && hasMethod;
      const noneSet = !hasAmount && !hasCurrency && !hasMethod;
      return allSet || noneSet;
    },
    {
      message: 'amount_paid_cents, currency, and payment_method must be set together or all omitted',
    }
  )
  .refine(
    (data) => {
      if (!data.paid) return true;
      return data.amount_paid_cents != null && data.amount_paid_cents > 0;
    },
    { message: 'Marked paid requires a positive amount_paid_cents' }
  );
export type RecordAttendanceInput = z.infer<typeof RecordAttendanceInputSchema>;

// ------------------------------------------------------------------
// Query string filters for list endpoints
// ------------------------------------------------------------------

export const ListClientsQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  tag: z.string().trim().max(30).optional(),
});
export type ListClientsQuery = z.infer<typeof ListClientsQuerySchema>;
