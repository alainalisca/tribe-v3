/**
 * POST /api/tribe-os/clients/import
 *
 * Bulk-create clients from a parsed CSV. The browser-side flow:
 *
 *   1. User uploads a CSV → lib/csv/parseClientsCSV produces
 *      ParsedClientRow[] + per-row errors
 *   2. User confirms the preview → POST here with { rows: [...] }
 *   3. Server validates each row with the existing CreateClientInputSchema
 *      (single source of truth on shape constraints — same one the
 *      manual /clients POST uses)
 *   4. Valid rows go through createClientsBulk in one query
 *
 * We return per-row validation errors AND the overall bulk-insert
 * result so the UI can show "200 imported, 3 skipped" with reasons.
 *
 * Why server-side re-validate even though the client already parsed?
 * Defense in depth — a malicious or buggy client could POST anything,
 * and the same Zod rules that gate the manual create flow also gate
 * this one. Cost is negligible (one schema pass per row).
 *
 * Throughput cap: MAX_IMPORT_ROWS protects the cron / DB from a
 * runaway upload. Coaches with bigger rosters can split the file or
 * ask us to bump the cap.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import { logError, log } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { createClientsBulk } from '@/lib/dal/clients';
import { writeAuditEntry } from '@/lib/dal/auditLog';
import { getGym, getGymForUser } from '@/lib/dal/gyms';
import { CreateClientInputSchema } from '@/lib/validations/clients';

const MAX_IMPORT_ROWS = 500;

const ImportBodySchema = z.object({
  rows: z
    .array(
      z.object({
        rowNumber: z.number().int().min(1),
        name: z.string(),
        email: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        status: z.enum(['active', 'inactive', 'lead', 'lapsed']).nullable().optional(),
        notes: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
        health_notes: z.string().nullable().optional(),
      })
    )
    .min(1, 'At least one row is required.')
    .max(MAX_IMPORT_ROWS, `Up to ${MAX_IMPORT_ROWS} rows per import.`),
});

interface RowError {
  rowNumber: number;
  message: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
    }

    let parsed;
    try {
      parsed = ImportBodySchema.parse(body);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json(
          { success: false, error: error.issues[0]?.message ?? 'Invalid input' },
          { status: 400 }
        );
      }
      throw error;
    }

    // Per-row validation. The CreateClient schema enforces:
    //   - name 1..120 chars (after trim)
    //   - email syntactic validity + length (when present)
    //   - phone length cap (when present)
    //   - status enum
    //   - notes / health_notes char caps
    //   - tags count + per-tag length
    // We strip rows that fail and collect the errors for the UI.
    const validInputs: Array<z.infer<typeof CreateClientInputSchema>> = [];
    const rowErrors: RowError[] = [];

    for (const row of parsed.rows) {
      // Normalize: empty strings → null on optional fields so Zod's
      // nullable-optional rules apply correctly. The CSV parser
      // already nulls empties but the client could send "" through.
      const candidate = {
        name: row.name,
        email: row.email && row.email.length > 0 ? row.email : null,
        phone: row.phone && row.phone.length > 0 ? row.phone : null,
        status: row.status ?? undefined,
        notes: row.notes && row.notes.length > 0 ? row.notes : null,
        tags: row.tags ?? [],
        health_notes: row.health_notes && row.health_notes.length > 0 ? row.health_notes : null,
      };
      try {
        const ok = CreateClientInputSchema.parse(candidate);
        validInputs.push(ok);
      } catch (error) {
        if (error instanceof ZodError) {
          rowErrors.push({
            rowNumber: row.rowNumber,
            message: error.issues[0]?.message ?? 'Invalid row',
          });
        } else {
          rowErrors.push({ rowNumber: row.rowNumber, message: 'Validation failed' });
        }
      }
    }

    if (validInputs.length === 0) {
      // Nothing to import — return the per-row diagnosis so the
      // UI can show the user what to fix.
      return NextResponse.json({ success: true, data: { created: 0, skipped: rowErrors.length, errors: rowErrors } });
    }

    // Bulk insert. RLS + the DAL's gym/instructor context handle the
    // tenant scoping — every row gets the caller's gym_id +
    // instructor_user_id, so we don't need per-row authorization.
    const result = await createClientsBulk(supabase, { gymId: gymId ?? null, instructorUserId: userId }, validInputs);
    if (!result.success) {
      // Whole-batch failure. The user fixes the CSV (the bulk insert
      // doesn't tell us which row tripped the constraint — we'd need
      // per-row inserts to diagnose, which is slower but doable in
      // a future iteration).
      return NextResponse.json({ success: false, error: result.error ?? 'bulk_insert_failed' }, { status: 500 });
    }

    log('info', 'tribe_os_clients_imported', {
      userId,
      gymId,
      created: result.data?.length ?? 0,
      skipped: rowErrors.length,
    });

    // Audit log: bulk import is forensically interesting (a sudden
    // 200-row import is the canary for either tool migration or a
    // hostile actor copy-pasting a member list). We log the count
    // aggregate rather than per-row entries — 200 audit rows for one
    // import would drown the log. The target is the gym itself
    // since there's no single client target for a bulk operation.
    if ((result.data?.length ?? 0) > 0) {
      const gymRes = gymId ? await getGym(supabase, gymId) : await getGymForUser(supabase, userId);
      const auditGymId = gymRes.success && gymRes.data ? gymRes.data.id : null;
      if (auditGymId) {
        await writeAuditEntry(supabase, {
          gymId: auditGymId,
          actorUserId: userId,
          action: 'clients.bulk_import',
          targetType: 'gym',
          targetId: auditGymId,
          payload: {
            created_count: result.data?.length ?? 0,
            skipped_count: rowErrors.length,
            total_rows_submitted: parsed.data.rows.length,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        created: result.data?.length ?? 0,
        skipped: rowErrors.length,
        errors: rowErrors,
      },
    });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/clients/import' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
