/**
 * /api/tribe-os/import/visits
 *   POST — bulk-import visit rows for existing gym clients.
 *
 * Gated by Tribe.OS premium via requireTribeOSPremium().
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { writeAuditEntry } from '@/lib/dal/auditLog';
import { parseImportDateTime } from '@/lib/tribe-os/import/parse';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VisitRowSchema = z.object({
  external_id: z.string().max(100).optional(),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(30).optional(),
  visit_date: z.string().max(30),
  visit_time: z.string().max(20).optional(),
  class_name: z.string().max(200).optional(),
  coach_name: z.string().max(200).optional(),
});

const ImportBody = z.object({
  rows: z.array(VisitRowSchema).min(1).max(500),
  source: z.enum(['mira_csv', 'csv']).default('csv'),
  file_name: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VisitRow = z.infer<typeof VisitRowSchema>;

interface ErrorRow {
  index: number;
  reason: string;
  row: VisitRow;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TZ = 'America/Bogota';

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  if (!gymId) {
    return NextResponse.json({ success: false, error: 'gym_required' }, { status: 400 });
  }

  try {
    // --- Parse body --------------------------------------------------------
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
    }

    const parsed = ImportBody.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Invalid input';
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }

    const { rows, source, file_name } = parsed.data;

    // --- Create the import record first so we have an import_id ------------
    const { data: importRecord, error: importErr } = await supabase
      .from('client_imports')
      .insert({
        gym_id: gymId,
        kind: 'visits',
        source,
        file_name: file_name ?? null,
        row_count: rows.length,
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: [],
        imported_by: userId,
      })
      .select('id')
      .single();

    if (importErr) {
      logError(importErr, { route: '/api/tribe-os/import/visits' });
      return NextResponse.json({ success: false, error: 'Failed to create import record' }, { status: 500 });
    }

    const importId = importRecord.id;

    // --- Process rows ------------------------------------------------------
    const errorRows: ErrorRow[] = [];
    let inserted = 0;
    let updated = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // --- Resolve client --------------------------------------------------
      let clientId: string | null = null;

      // 1) Match by external_id
      if (!clientId && row.external_id) {
        const { data } = await supabase
          .from('clients')
          .select('id')
          .eq('gym_id', gymId)
          .eq('external_id', row.external_id)
          .maybeSingle();
        if (data) clientId = data.id;
      }

      // 2) Match by email
      if (!clientId && row.email) {
        const { data } = await supabase
          .from('clients')
          .select('id')
          .eq('gym_id', gymId)
          .eq('email', row.email)
          .maybeSingle();
        if (data) clientId = data.id;
      }

      // 3) Match by phone
      if (!clientId && row.phone) {
        const { data } = await supabase
          .from('clients')
          .select('id')
          .eq('gym_id', gymId)
          .eq('phone', row.phone)
          .maybeSingle();
        if (data) clientId = data.id;
      }

      if (!clientId) {
        errorRows.push({ index: i, reason: 'unresolved_member', row });
        continue;
      }

      // --- Parse visit datetime --------------------------------------------
      const dtResult = parseImportDateTime(row.visit_date, row.visit_time, TZ);
      if (dtResult.error) {
        errorRows.push({ index: i, reason: `visit_date_${dtResult.error}`, row });
        continue;
      }

      // --- Upsert visit ----------------------------------------------------
      const { error: upsertErr, status } = await supabase.from('client_visits').upsert(
        {
          gym_id: gymId,
          client_id: clientId,
          visited_at: dtResult.datetime,
          class_name: row.class_name ?? null,
          coach_name: row.coach_name ?? null,
          source,
          external_id: row.external_id ?? null,
          import_id: importId,
        },
        { onConflict: 'gym_id,client_id,visited_at' }
      );

      if (upsertErr) {
        errorRows.push({ index: i, reason: `db_error: ${upsertErr.message}`, row });
        continue;
      }

      // HTTP 201 = inserted, 200 = updated (Supabase convention)
      if (status === 201) {
        inserted++;
      } else {
        updated++;
      }
    }

    // --- Update the import record with final counts ------------------------
    await supabase
      .from('client_imports')
      .update({
        inserted,
        updated,
        skipped: errorRows.length,
        errors: errorRows,
      })
      .eq('id', importId);

    // --- Audit -------------------------------------------------------------
    await writeAuditEntry(supabase, {
      gymId,
      actorUserId: userId,
      action: 'import.visits',
      targetType: 'client_imports',
      targetId: importId,
      payload: { inserted, updated, skipped: errorRows.length },
    });

    return NextResponse.json({
      success: true,
      data: {
        import_id: importId,
        inserted,
        updated,
        skipped: errorRows.length,
        errors: errorRows,
      },
    });
  } catch (error) {
    logError(error, { route: '/api/tribe-os/import/visits' });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
