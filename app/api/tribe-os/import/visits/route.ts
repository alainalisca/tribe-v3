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
import { parseImportDateTime, detectDateFormat } from '@/lib/tribe-os/import/parse';
import type { SlashFormat } from '@/lib/tribe-os/import/parse';

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
  date_formats: z.record(z.string(), z.enum(['dm', 'md'])).optional(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VisitRow = z.infer<typeof VisitRowSchema>;

interface ErrorRow {
  index: number;
  reason: string;
  code?: string;
  row: VisitRow;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TZ = 'America/Bogota';
const INSERT_CHUNK = 500;

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

    const { rows, source, file_name, date_formats } = parsed.data;

    // Detect date format for visit_date column across all rows
    let visitDateFormat: SlashFormat = 'dm';
    if (date_formats?.visit_date) {
      visitDateFormat = date_formats.visit_date;
    } else {
      const values = rows.map((r) => r.visit_date);
      const detected = detectDateFormat(values, TZ);
      if (!detected.error) visitDateFormat = detected.format;
    }

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

    // --- Resolve all client ids in bulk ------------------------------------
    // Collect unique identifiers across all rows
    const extIds = new Set<string>();
    const emails = new Set<string>();
    const phones = new Set<string>();
    for (const row of rows) {
      if (row.external_id) extIds.add(row.external_id);
      if (row.email) emails.add(row.email);
      if (row.phone) phones.add(row.phone);
    }

    // Fetch matching clients in bulk
    const clientByExtId = new Map<string, string>();
    const clientByEmail = new Map<string, string>();
    const clientByPhone = new Map<string, string>();

    if (extIds.size > 0) {
      const { data } = await supabase
        .from('clients')
        .select('id, external_id')
        .eq('gym_id', gymId)
        .in('external_id', [...extIds]);
      for (const c of data ?? []) {
        if (c.external_id) clientByExtId.set(c.external_id, c.id);
      }
    }

    if (emails.size > 0) {
      const { data } = await supabase
        .from('clients')
        .select('id, email')
        .eq('gym_id', gymId)
        .in('email', [...emails]);
      for (const c of data ?? []) {
        if (c.email) clientByEmail.set(c.email, c.id);
      }
    }

    if (phones.size > 0) {
      const { data } = await supabase
        .from('clients')
        .select('id, phone')
        .eq('gym_id', gymId)
        .in('phone', [...phones]);
      for (const c of data ?? []) {
        if (c.phone) clientByPhone.set(c.phone, c.id);
      }
    }

    // --- Parse and validate all rows, build insert payloads ----------------
    const errorRows: ErrorRow[] = [];
    const validPayloads: Array<{
      index: number;
      row: VisitRow;
      payload: Record<string, unknown>;
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Resolve client: external_id → email → phone
      let clientId: string | undefined;
      if (row.external_id) clientId = clientByExtId.get(row.external_id);
      if (!clientId && row.email) clientId = clientByEmail.get(row.email);
      if (!clientId && row.phone) clientId = clientByPhone.get(row.phone);

      if (!clientId) {
        errorRows.push({ index: i, reason: 'unresolved_member', row });
        continue;
      }

      // Parse visit datetime
      const dtResult = parseImportDateTime(row.visit_date, row.visit_time, TZ, visitDateFormat);
      if (dtResult.error) {
        errorRows.push({ index: i, reason: `visit_date_${dtResult.error}`, row });
        continue;
      }

      validPayloads.push({
        index: i,
        row,
        payload: {
          gym_id: gymId,
          client_id: clientId,
          visited_at: dtResult.datetime,
          class_name: row.class_name ?? null,
          coach_name: row.coach_name ?? null,
          source,
          external_id: row.external_id ?? null,
          import_id: importId,
        },
      });
    }

    // --- Insert in chunks with ON CONFLICT DO NOTHING ---------------------
    // Visits are immutable — duplicates are skipped, not updated.
    let inserted = 0;
    let skippedDuplicates = 0;

    for (let c = 0; c < validPayloads.length; c += INSERT_CHUNK) {
      const chunk = validPayloads.slice(c, c + INSERT_CHUNK);
      const payloads = chunk.map((v) => v.payload);

      const {
        data: insertedData,
        error: insertErr,
        status,
      } = await supabase
        .from('client_visits')
        .upsert(payloads, { onConflict: 'gym_id,client_id,visited_at', ignoreDuplicates: true })
        .select('id');

      if (insertErr) {
        // Log raw error (no PII — only error metadata and gym_id)
        console.error('[visits-import] chunk insert failed:', {
          code: insertErr.code,
          message: insertErr.message,
          details: insertErr.details,
          hint: insertErr.hint,
          gymId,
          importId,
          chunkStart: c,
          chunkSize: chunk.length,
        });

        // Mark all rows in this chunk as errors
        for (const v of chunk) {
          errorRows.push({
            index: v.index,
            reason: `db_error: ${insertErr.message}`,
            code: insertErr.code,
            row: v.row,
          });
        }
        continue;
      }

      const insertedCount = insertedData?.length ?? 0;
      inserted += insertedCount;
      skippedDuplicates += chunk.length - insertedCount;
    }

    // --- Update the import record with final counts ------------------------
    await supabase
      .from('client_imports')
      .update({
        inserted,
        updated: 0,
        skipped: skippedDuplicates + errorRows.length,
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
      payload: { inserted, already_existed: skippedDuplicates, errors: errorRows.length },
    });

    return NextResponse.json({
      success: true,
      data: {
        import_id: importId,
        inserted,
        updated: 0,
        already_existed: skippedDuplicates,
        errors: errorRows,
      },
    });
  } catch (error) {
    logError(error, { route: '/api/tribe-os/import/visits' });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
