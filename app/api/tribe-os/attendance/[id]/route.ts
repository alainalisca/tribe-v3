/**
 * /api/tribe-os/attendance/[id]
 *   PATCH  — partial update of a single attendance row
 *   DELETE — hard-delete an attendance row
 *
 * Coaches occasionally need to fix mistakes:
 *   - Recorded the wrong attended status → flip attended
 *   - Recorded paid=true and then issued a refund → flip paid
 *   - Wrong amount or currency → correct it
 *   - Recorded for the wrong client entirely → DELETE
 *
 * The 079 counter trigger refires on UPDATE OF attended/attended_at +
 * on DELETE, so the client's cached counters stay accurate. The 076
 * partner trigger only fires on false → true transitions; flipping
 * attended back to false leaves community-graph edges in place
 * (partial history shouldn't blow away the graph).
 *
 * RLS: scoping runs through the parent client's instructor/coach
 * relationship — coaches can only mutate attendance for clients in
 * their gym.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { updateAttendance, deleteAttendance } from '@/lib/dal/clients';
import { UpdateAttendanceInputSchema } from '@/lib/validations/clients';

function firstZodMessage(error: ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input';
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase } = gate;

  try {
    const { id: attendanceId } = await params;
    if (!attendanceId) {
      return NextResponse.json({ success: false, error: 'attendance_id_required' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
    }

    let parsed;
    try {
      parsed = UpdateAttendanceInputSchema.parse(body);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json({ success: false, error: firstZodMessage(error) }, { status: 400 });
      }
      throw error;
    }

    const result = await updateAttendance(supabase, attendanceId, parsed);
    if (!result.success) {
      const status = result.error === 'no_updates' ? 400 : 500;
      return NextResponse.json({ success: false, error: result.error ?? 'update_failed' }, { status });
    }
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    logError(error, { route: 'PATCH /api/tribe-os/attendance/[id]' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase } = gate;

  try {
    const { id: attendanceId } = await params;
    if (!attendanceId) {
      return NextResponse.json({ success: false, error: 'attendance_id_required' }, { status: 400 });
    }

    const result = await deleteAttendance(supabase, attendanceId);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'delete_failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logError(error, { route: 'DELETE /api/tribe-os/attendance/[id]' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
