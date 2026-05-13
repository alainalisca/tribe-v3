/**
 * POST /api/tribe-os/attendance/[id]/refund
 *
 * Record a refund against a previously-paid attendance row. Writes
 * the three refund fields (refunded_amount_cents, refunded_at,
 * refund_reason) added in migration 083 + drops an
 * `attendance.refund` row in the audit log.
 *
 * Why this is its own endpoint instead of an extra branch on PATCH:
 *   - PATCH updates can be reverted; refunds are forensic-grade
 *     events that we don't want to mix with routine edits
 *   - The audit-log payload schema is different (carries refund
 *     amount + reason, not the regular field diff)
 *   - Validation error codes are specific to the refund path
 *     (not_paid / already_refunded / amount_invalid)
 *
 * Body: { refunded_amount_cents: number, refund_reason: string }
 *
 * Auth:
 *   - Tribe.OS premium gate
 *   - RLS scopes the underlying update to the caller's clients
 *
 * Failure modes:
 *   400 invalid_input / invalid_json / amount_invalid / reason_invalid
 *   404 not_found
 *   409 already_refunded / not_paid (state conflicts)
 *   500 db_error / internal_error
 */

import { NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { refundAttendance } from '@/lib/dal/clients';
import { writeAuditEntry } from '@/lib/dal/auditLog';

interface RefundBody {
  refunded_amount_cents?: unknown;
  refund_reason?: unknown;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId } = gate;

  try {
    const { id: attendanceId } = await params;
    if (!attendanceId) {
      return NextResponse.json({ success: false, error: 'attendance_id_required' }, { status: 400 });
    }

    let body: RefundBody;
    try {
      body = (await request.json()) as RefundBody;
    } catch {
      return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
    }

    const cents = typeof body.refunded_amount_cents === 'number' ? body.refunded_amount_cents : NaN;
    const reason = typeof body.refund_reason === 'string' ? body.refund_reason : '';
    if (!Number.isFinite(cents) || cents <= 0 || !reason.trim()) {
      return NextResponse.json({ success: false, error: 'invalid_input' }, { status: 400 });
    }

    const result = await refundAttendance(supabase, attendanceId, {
      refundedAmountCents: cents,
      refundReason: reason,
    });
    if (!result.success) {
      const err = result.error ?? 'db_error';
      // Map DAL discriminators to HTTP statuses. 409 for state conflicts
      // ("you already refunded this" / "it was never paid") so the client
      // can show a meaningful banner instead of a generic 500.
      const status =
        err === 'not_found'
          ? 404
          : err === 'amount_invalid' || err === 'reason_invalid'
            ? 400
            : err === 'already_refunded' || err === 'not_paid'
              ? 409
              : 500;
      return NextResponse.json({ success: false, error: err }, { status });
    }

    const snapshot = result.data;
    if (snapshot && snapshot.gym_id) {
      // Audit. Carries everything needed to reconstruct the event
      // without joining anything that might be gone later (client +
      // attendance can both be archived/purged subsequently).
      await writeAuditEntry(supabase, {
        gymId: snapshot.gym_id,
        actorUserId: userId,
        action: 'attendance.refund',
        targetType: 'attendance',
        targetId: snapshot.id,
        payload: {
          client_id: snapshot.client_id,
          session_id: snapshot.session_id,
          amount_paid_cents: snapshot.amount_paid_cents,
          refunded_amount_cents: snapshot.refunded_amount_cents,
          currency: snapshot.currency,
          refund_reason: snapshot.refund_reason,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        refunded_amount_cents: snapshot?.refunded_amount_cents ?? null,
        refunded_at: snapshot?.refunded_at ?? null,
      },
    });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/attendance/[id]/refund' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
