/**
 * POST /api/tribe-os/intelligence/bulk-dismiss
 *
 * Mark every active insight matching the given filter as actioned
 * in a single round-trip. Companion to the per-insight dismiss
 * endpoint at /[id]/dismiss — useful when a coach scans a wall of
 * LOW-severity cards and wants them all gone at once, or wants to
 * clear all RETENTION_OPP cards because they handled them
 * out-of-band.
 *
 * Body:
 *   { severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }
 *   { type?: 'CHURN_RISK' | 'RETENTION_OPP' | 'REVENUE' | 'GROWTH' }
 *   { ids?: string[] }
 *
 * At least one filter must be provided. Filters AND together
 * (severity='LOW' + type='CHURN_RISK' → low-severity churn cards
 * only). `ids` takes precedence when present.
 *
 * Auth:
 *   - Tribe.OS premium gate
 *   - RLS handles tenant scoping on the UPDATE — coaches can only
 *     dismiss insights in their gym
 *
 * Response: { success: true, data: { dismissed: number } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError, z } from 'zod';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { writeAuditEntry } from '@/lib/dal/auditLog';

const BulkDismissSchema = z
  .object({
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    type: z.enum(['CHURN_RISK', 'RETENTION_OPP', 'REVENUE', 'GROWTH']).optional(),
    ids: z.array(z.string().uuid()).optional(),
  })
  .refine((data) => data.severity !== undefined || data.type !== undefined || (data.ids && data.ids.length > 0), {
    message: 'At least one of severity, type, or ids is required.',
  });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, gymId, userId } = gate;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
    }

    let parsed;
    try {
      parsed = BulkDismissSchema.parse(body);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json(
          { success: false, error: error.issues[0]?.message ?? 'Invalid input' },
          { status: 400 }
        );
      }
      throw error;
    }

    // Build the update. RLS gates the rows we can touch to the
    // caller's gym, but we add an explicit gym_id filter as
    // defense-in-depth so we never accidentally touch rows in
    // another tenant if a policy mis-fires.
    let query = supabase
      .from('community_insights')
      .update({ is_actioned: true }, { count: 'exact' })
      .eq('is_actioned', false);

    if (gymId) query = query.eq('gym_id', gymId);
    if (parsed.ids && parsed.ids.length > 0) {
      query = query.in('id', parsed.ids);
    } else {
      if (parsed.severity) query = query.eq('severity', parsed.severity);
      if (parsed.type) query = query.eq('type', parsed.type);
    }

    const { error, count } = await query;
    if (error) {
      logError(error, { action: 'intelligence.bulk_dismiss', userId, gymId, filter: parsed });
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const dismissed = count ?? 0;

    // Forensic record — bulk dismiss is sensitive in multi-coach gyms
    // (one coach can hide problems from another by mass-dismissing
    // their assigned-to insights). Only log when we actually changed
    // something; a zero-count call is a no-op worth ignoring.
    if (dismissed > 0 && gymId) {
      await writeAuditEntry(supabase, {
        gymId,
        actorUserId: userId,
        action: 'insight.bulk_dismiss',
        targetType: 'insight',
        // Bulk action has no single target; the payload describes
        // the filter that was applied + how many rows it touched.
        targetId: null,
        payload: {
          dismissed,
          filter: {
            severity: parsed.severity ?? null,
            type: parsed.type ?? null,
            ids: parsed.ids ?? null,
          },
        },
      });
    }

    return NextResponse.json({ success: true, data: { dismissed } });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/intelligence/bulk-dismiss' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
