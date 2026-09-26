/**
 * /api/tribe-os/import/members
 *   POST — bulk-import member rows into the gym's client roster.
 *
 * Gated by Tribe.OS premium via requireTribeOSPremium().
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { writeAuditEntry } from '@/lib/dal/auditLog';
import { parseImportDate, normalizeStatus } from '@/lib/tribe-os/import/parse';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const MemberRowSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(30).optional(),
  external_id: z.string().max(100).optional(),
  status: z.string().max(50).optional(),
  joined_on: z.string().max(30).optional(),
  membership_plan: z.string().max(100).optional(),
  plan_ends_on: z.string().max(30).optional(),
});

const ImportBody = z.object({
  rows: z.array(MemberRowSchema).min(1).max(500),
  source: z.enum(['mira_csv', 'csv']).default('csv'),
  file_name: z.string().max(200).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MemberRow = z.infer<typeof MemberRowSchema>;

interface ErrorRow {
  index: number;
  reason: string;
  row: MemberRow;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TZ = 'America/Bogota';

function hasIdentifier(row: MemberRow): boolean {
  return !!(row.name || row.email || row.phone || row.external_id);
}

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

    const { rows, source, file_name, tags: batchTags } = parsed.data;

    // --- Process rows ------------------------------------------------------
    const errorRows: ErrorRow[] = [];
    const warnings: Array<{ index: number; warning: string }> = [];
    let inserted = 0;
    let updated = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Must have at least one identifier
      if (!hasIdentifier(row)) {
        errorRows.push({ index: i, reason: 'missing_identifier', row });
        continue;
      }

      // Parse dates
      let joinedDate: string | null = null;
      let planEndsDate: string | null = null;

      if (row.joined_on) {
        const result = parseImportDate(row.joined_on, TZ);
        if (result.error) {
          errorRows.push({ index: i, reason: `joined_on_${result.error}`, row });
          continue;
        }
        joinedDate = result.date ?? null;
      }

      if (row.plan_ends_on) {
        const result = parseImportDate(row.plan_ends_on, TZ);
        if (result.error) {
          errorRows.push({ index: i, reason: `plan_ends_on_${result.error}`, row });
          continue;
        }
        planEndsDate = result.date ?? null;
      }

      // --- Upsert logic ----------------------------------------------------
      let existingId: string | null = null;

      // 1) Match by external_id
      if (!existingId && row.external_id) {
        const { data } = await supabase
          .from('clients')
          .select('id')
          .eq('gym_id', gymId)
          .eq('external_source', 'csv')
          .eq('external_id', row.external_id)
          .maybeSingle();
        if (data) existingId = data.id;
      }

      // 2) Match by email
      if (!existingId && row.email) {
        const { data } = await supabase
          .from('clients')
          .select('id')
          .eq('gym_id', gymId)
          .eq('email', row.email)
          .maybeSingle();
        if (data) existingId = data.id;
      }

      // 3) Match by phone
      if (!existingId && row.phone) {
        const { data } = await supabase
          .from('clients')
          .select('id')
          .eq('gym_id', gymId)
          .eq('phone', row.phone)
          .maybeSingle();
        if (data) existingId = data.id;
      }

      // Status mapping (Spanish → canonical)
      const statusResult = normalizeStatus(row.status);
      if (statusResult.warning) {
        warnings.push({ index: i, warning: statusResult.warning });
      }

      // Build the payload (only non-null fields, NEVER health_notes)
      const rowTags = [...(batchTags ?? []), ...statusResult.tags];
      const payload: Record<string, unknown> = {
        external_source: source,
        status: statusResult.status,
      };
      if (rowTags.length > 0) payload.tags = rowTags;
      if (row.name != null) payload.name = row.name;
      if (row.email != null) payload.email = row.email;
      if (row.phone != null) payload.phone = row.phone;
      if (row.external_id != null) payload.external_id = row.external_id;
      if (joinedDate != null) payload.joined_on = joinedDate;
      if (row.membership_plan != null) payload.membership_plan = row.membership_plan;
      if (planEndsDate != null) payload.plan_ends_on = planEndsDate;

      if (existingId) {
        // UPDATE
        const { error } = await supabase.from('clients').update(payload).eq('id', existingId);
        if (error) {
          errorRows.push({ index: i, reason: `db_error: ${error.message}`, row });
          continue;
        }
        updated++;
      } else {
        // INSERT
        const { error } = await supabase.from('clients').insert({ gym_id: gymId, ...payload });
        if (error) {
          errorRows.push({ index: i, reason: `db_error: ${error.message}`, row });
          continue;
        }
        inserted++;
      }
    }

    // --- Record import -----------------------------------------------------
    const { data: importRecord, error: importErr } = await supabase
      .from('client_imports')
      .insert({
        gym_id: gymId,
        kind: 'members',
        source,
        file_name: file_name ?? null,
        row_count: rows.length,
        inserted,
        updated,
        skipped: errorRows.length,
        errors: errorRows,
        imported_by: userId,
      })
      .select('id')
      .single();

    if (importErr) {
      logError(importErr, { route: '/api/tribe-os/import/members' });
      return NextResponse.json({ success: false, error: 'Failed to record import' }, { status: 500 });
    }

    // --- Audit -------------------------------------------------------------
    await writeAuditEntry(supabase, {
      gymId,
      actorUserId: userId,
      action: 'import.members',
      targetType: 'client_imports',
      targetId: importRecord.id,
      payload: { inserted, updated, skipped: errorRows.length },
    });

    return NextResponse.json({
      success: true,
      data: {
        import_id: importRecord.id,
        inserted,
        updated,
        skipped: errorRows.length,
        errors: errorRows,
        warnings,
      },
    });
  } catch (error) {
    logError(error, { route: '/api/tribe-os/import/members' });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
