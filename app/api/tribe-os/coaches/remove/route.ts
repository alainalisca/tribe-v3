/**
 * POST /api/tribe-os/coaches/remove
 *
 * Remove a coach from the caller's gym. Owner-only (same gate as
 * the invite endpoint). Refuses to remove the owner — every gym
 * needs an owner, and ownership transfer is a separate flow that
 * doesn't exist yet.
 *
 * Body: { user_id: string }
 *
 * Why POST instead of DELETE: the body is non-trivial (a UUID
 * payload) and DELETE-with-body is poorly supported by fetch /
 * proxies. POST with an explicit /remove suffix is clearer.
 *
 * Response (200): { success: true }
 * Failures:
 *   400 invalid body / removing owner
 *   401, 403, 404 — same gate semantics as other premium routes
 *   500 server / DB error
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { ZodError } from 'zod';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { getGym, getGymForUser } from '@/lib/dal/gyms';
import { writeAuditEntry } from '@/lib/dal/auditLog';
import { RemoveCoachInputSchema } from '@/lib/validations/coaches';

function firstZodMessage(error: ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
    }

    let parsed;
    try {
      parsed = RemoveCoachInputSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json({ success: false, error: firstZodMessage(error) }, { status: 400 });
      }
      throw error;
    }

    const gymRes = gymId ? await getGym(supabase, gymId) : await getGymForUser(supabase, userId);
    if (!gymRes.success) {
      logError(new Error(gymRes.error ?? 'unknown'), { action: 'coaches.remove.gym_lookup', userId });
      return NextResponse.json({ success: false, error: 'gym_lookup_failed' }, { status: 500 });
    }
    if (!gymRes.data) {
      return NextResponse.json({ success: false, error: 'no_gym' }, { status: 404 });
    }
    if (gymRes.data.owner_user_id !== userId) {
      return NextResponse.json({ success: false, error: 'owner_only' }, { status: 403 });
    }

    // Refuse to remove the owner. Every gym needs an owner; transfer
    // ownership before deletion. Same guard as the CLI's removeCoach.
    if (parsed.user_id === gymRes.data.owner_user_id) {
      return NextResponse.json({ success: false, error: 'cannot_remove_owner' }, { status: 400 });
    }

    // Service-role for the actual DELETE — RLS on gym_coaches
    // restricts writes to service-role, and we already gated the
    // caller above.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ success: false, error: 'server_misconfigured' }, { status: 500 });
    }
    const service = createServiceClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Snapshot the coach's name + role BEFORE deleting so the audit
    // payload carries what we removed. Once the gym_coaches row is
    // gone we can't reconstruct the role they had, and if the user
    // row later gets hard-deleted we lose the name too. Cheap query,
    // worth it for the forensic value.
    const { data: snapshot } = await service
      .from('gym_coaches')
      .select('role, user:users!gym_coaches_user_id_fkey(id, name, email)')
      .eq('gym_id', gymRes.data.id)
      .eq('user_id', parsed.user_id)
      .maybeSingle();
    const snapshotUser = (snapshot as { role?: string; user?: { name?: string | null; email?: string | null } } | null)
      ?.user;
    const snapshotRole = (snapshot as { role?: string } | null)?.role ?? null;

    const { error: delErr, count } = await service
      .from('gym_coaches')
      .delete({ count: 'exact' })
      .eq('gym_id', gymRes.data.id)
      .eq('user_id', parsed.user_id);
    if (delErr) {
      logError(delErr, {
        action: 'coaches.remove.delete',
        userId,
        gymId: gymRes.data.id,
        targetUserId: parsed.user_id,
      });
      return NextResponse.json({ success: false, error: delErr.message }, { status: 500 });
    }

    // Audit log: only on a real removal (count > 0). A no-op delete
    // shouldn't leave a forensic trail — that would muddy the log
    // with "removed user X" entries for users who weren't on the
    // gym in the first place.
    if ((count ?? 0) > 0) {
      await writeAuditEntry(supabase, {
        gymId: gymRes.data.id,
        actorUserId: userId,
        action: 'coach.remove',
        targetType: 'coach',
        targetId: parsed.user_id,
        payload: {
          name: snapshotUser?.name ?? null,
          email: snapshotUser?.email ?? null,
          role: snapshotRole,
        },
      });
    }

    return NextResponse.json({ success: true, data: { removed_count: count ?? 0 } });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/coaches/remove' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
