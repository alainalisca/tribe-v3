/**
 * POST /api/tribe-os/coaches/invite
 *
 * Add a user to the caller's gym as a coach or assistant. Caller
 * must be the gym OWNER (not just a coach) — once a role-permission
 * system lands we can let assistants invite too, but during the
 * single-coach beta the owner is the only person who should be
 * adding roster.
 *
 * Body: { email: string, role?: 'coach' | 'assistant' }
 *
 * Flow:
 *   1. requireTribeOSPremium gives us the caller's gymId
 *   2. Verify caller is the gym owner; reject 403 otherwise
 *   3. Look up the invitee by email (lower-cased); 404 if not on Tribe
 *   4. Upsert into gym_coaches; idempotent
 *
 * Response (200): { success: true, data: { user_id, role } }
 * Failures:
 *   400 invalid body / email not a Tribe user (with a distinct error
 *     code so the UI can show "ask them to sign up first" copy)
 *   401, 403, 404 — same gate semantics as other premium routes
 *   500 server / DB error
 *
 * Service-role escape: we don't use service-role here. The owner
 * check guards INSERT via the normal session client + RLS on
 * gym_coaches (service-role only). To get past the RLS-on-insert
 * we need service-role — but exposing service-role behind an
 * authenticated route is a normal pattern as long as we gate it
 * properly, which we do (owner check). So we DO use service-role
 * for the actual insert.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { ZodError } from 'zod';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { getGym, getGymForUser } from '@/lib/dal/gyms';
import { InviteCoachInputSchema } from '@/lib/validations/coaches';

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
      parsed = InviteCoachInputSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json({ success: false, error: firstZodMessage(error) }, { status: 400 });
      }
      throw error;
    }

    // Resolve the caller's gym + verify ownership.
    const gymRes = gymId ? await getGym(supabase, gymId) : await getGymForUser(supabase, userId);
    if (!gymRes.success) {
      logError(new Error(gymRes.error ?? 'unknown'), { action: 'coaches.invite.gym_lookup', userId });
      return NextResponse.json({ success: false, error: 'gym_lookup_failed' }, { status: 500 });
    }
    if (!gymRes.data) {
      return NextResponse.json({ success: false, error: 'no_gym' }, { status: 404 });
    }
    if (gymRes.data.owner_user_id !== userId) {
      // Only the owner can invite. When role-based permissions
      // land, this becomes a role check instead.
      return NextResponse.json({ success: false, error: 'owner_only' }, { status: 403 });
    }

    // Look up the invitee by email. Service-role bypass needed
    // because RLS on users restricts cross-user reads of email.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ success: false, error: 'server_misconfigured' }, { status: 500 });
    }
    const service = createServiceClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: invitee, error: lookupErr } = await service
      .from('users')
      .select('id, email, name')
      .eq('email', parsed.email)
      .maybeSingle();
    if (lookupErr) {
      logError(lookupErr, { action: 'coaches.invite.user_lookup', userId, email: parsed.email });
      return NextResponse.json({ success: false, error: 'user_lookup_failed' }, { status: 500 });
    }
    if (!invitee) {
      // Distinct error code so the UI can say "ask them to sign up
      // for Tribe first, then come back here".
      return NextResponse.json({ success: false, error: 'user_not_on_tribe' }, { status: 400 });
    }

    if (invitee.id === userId) {
      return NextResponse.json({ success: false, error: 'cannot_invite_self' }, { status: 400 });
    }

    const role = parsed.role ?? 'coach';

    // Idempotent: re-inviting the same person updates their role
    // (or no-ops if the role matches) rather than erroring on the
    // PK conflict.
    const { error: upsertErr } = await service
      .from('gym_coaches')
      .upsert({ gym_id: gymRes.data.id, user_id: invitee.id, role }, { onConflict: 'gym_id,user_id' });
    if (upsertErr) {
      logError(upsertErr, {
        action: 'coaches.invite.upsert',
        userId,
        gymId: gymRes.data.id,
        invitee: invitee.id,
      });
      return NextResponse.json({ success: false, error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: { user_id: invitee.id, role, name: invitee.name, email: invitee.email },
    });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/coaches/invite' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
