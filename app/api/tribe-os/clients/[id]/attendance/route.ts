/**
 * /api/tribe-os/clients/[id]/attendance
 *   POST — record (or update) attendance for this client at a session
 *   GET  — attendance history for this client
 *
 * Both gated by Tribe.OS premium. RLS additionally scopes to the
 * caller's own clients via the parent client's instructor_user_id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { recordAttendance, listAttendanceForClient, type RecordAttendanceInput } from '@/lib/dal/clients';
import { RecordAttendanceInputSchema } from '@/lib/validations/clients';

function firstZodMessage(error: ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input';
}

export async function POST(
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
      parsed = RecordAttendanceInputSchema.parse(body);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json({ success: false, error: firstZodMessage(error) }, { status: 400 });
      }
      throw error;
    }

    // Reshape parsed body into the DAL's discriminated-union type. The
    // Zod refinement already guarantees all-or-nothing on payment
    // fields, so the non-null assertions on currency / payment_method
    // are safe — TypeScript just can't see through the refinement.
    const dalInput: RecordAttendanceInput =
      parsed.amount_paid_cents != null
        ? {
            client_id: clientId,
            session_id: parsed.session_id,
            attended: parsed.attended,
            paid: parsed.paid,
            attended_at: parsed.attended_at ?? null,
            notes: parsed.notes ?? null,
            amount_paid_cents: parsed.amount_paid_cents,
            // Refined as co-required with amount; non-null asserted.
            currency: parsed.currency!,
            payment_method: parsed.payment_method!,
          }
        : {
            client_id: clientId,
            session_id: parsed.session_id,
            attended: parsed.attended,
            paid: parsed.paid,
            attended_at: parsed.attended_at ?? null,
            notes: parsed.notes ?? null,
          };

    const result = await recordAttendance(supabase, dalInput);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'record_failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/clients/[id]/attendance' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
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

    const result = await listAttendanceForClient(supabase, clientId);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'list_failed' }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: result.data ?? [] });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/clients/[id]/attendance' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
