/**
 * /api/tribe-os/clients/[id]
 *   GET    — client detail + attendance summary
 *   PATCH  — partial update
 *   DELETE — soft delete (archive)
 *
 * RLS scopes all reads/writes to the caller's own clients. The
 * premium gate ensures only Tribe.OS premium users hit any of these.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import {
  getClient,
  updateClient as dalUpdateClient,
  deleteClient as dalDeleteClient,
  getClientAttendanceSummary,
} from '@/lib/dal/clients';
import { writeAuditEntry } from '@/lib/dal/auditLog';
import { UpdateClientInputSchema } from '@/lib/validations/clients';

function firstZodMessage(error: ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input';
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase } = gate;

  try {
    const { id: clientId } = await params;
    if (!clientId) {
      return NextResponse.json({ success: false, error: 'client_id_required' }, { status: 400 });
    }

    const clientResult = await getClient(supabase, clientId);
    if (!clientResult.success) {
      return NextResponse.json({ success: false, error: clientResult.error ?? 'fetch_failed' }, { status: 500 });
    }
    if (!clientResult.data) {
      return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
    }

    const summaryResult = await getClientAttendanceSummary(supabase, clientId);
    if (!summaryResult.success) {
      return NextResponse.json({ success: false, error: summaryResult.error ?? 'summary_failed' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        client: clientResult.data,
        summary: summaryResult.data,
      },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/clients/[id]' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase } = gate;

  try {
    const { id: clientId } = await params;
    if (!clientId) {
      return NextResponse.json({ success: false, error: 'client_id_required' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
    }

    let parsed;
    try {
      parsed = UpdateClientInputSchema.parse(body);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json({ success: false, error: firstZodMessage(error) }, { status: 400 });
      }
      throw error;
    }

    const result = await dalUpdateClient(supabase, clientId, parsed);
    if (!result.success) {
      const status = result.error === 'no_updates' ? 400 : 500;
      return NextResponse.json({ success: false, error: result.error ?? 'update_failed' }, { status });
    }
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    logError(error, { route: 'PATCH /api/tribe-os/clients/[id]' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId } = gate;

  try {
    const { id: clientId } = await params;
    if (!clientId) {
      return NextResponse.json({ success: false, error: 'client_id_required' }, { status: 400 });
    }

    // Snapshot the client BEFORE archiving so we can stash its name
    // + gym_id in the audit payload. Once archived the row still
    // exists, but pre-snapshot keeps the audit decoupled from the
    // mutation's race conditions.
    const snapshot = await getClient(supabase, clientId);
    const targetName = snapshot.success && snapshot.data ? snapshot.data.name : null;
    const targetGymId = snapshot.success && snapshot.data ? snapshot.data.gym_id : null;

    const result = await dalDeleteClient(supabase, clientId);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'delete_failed' }, { status: 500 });
    }

    // Append a forensic entry. Awaited so we get observability in
    // Vercel logs but failures don't surface to the caller.
    if (targetGymId) {
      await writeAuditEntry(supabase, {
        gymId: targetGymId,
        actorUserId: userId,
        action: 'client.archive',
        targetType: 'client',
        targetId: clientId,
        payload: targetName ? { name: targetName } : undefined,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { route: 'DELETE /api/tribe-os/clients/[id]' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
