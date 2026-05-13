/**
 * /api/tribe-os/gym
 *   GET   — fetch the caller's gym (display + edit fields)
 *   PATCH — update the caller's gym. Owner only.
 *
 * Why owner-only for PATCH: editing the gym's display name affects
 * every coach in the gym and shows up in client-facing surfaces (the
 * welcome email subject, the share URL slug, etc.). Letting any
 * coach mutate that is a recipe for confusion. The invite/role
 * management flow lands later; until then, the gym's creator is the
 * single authoritative editor.
 *
 * Failure modes:
 *   400 invalid body (Zod error)
 *   401 not signed in
 *   403 not Tribe.OS premium, OR signed in + premium but not the gym owner
 *   404 no gym associated with this user yet
 *   500 server / DB error
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { getGym, getGymForUser, updateGym } from '@/lib/dal/gyms';
import { UpdateGymInputSchema } from '@/lib/validations/gym';

function firstZodMessage(error: ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input';
}

// ----- GET -----

export async function GET(_request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    // Resolve the gym. Either via the gate's gymId or via the
    // user-lookup fallback for legacy-path sessions. The response
    // includes is_owner so client-side surfaces can gate owner-only
    // affordances (edit / delete / add member / remove coach) without
    // having to compare userIds on their own.
    if (gymId) {
      const res = await getGym(supabase, gymId);
      if (!res.success) {
        logError(new Error(res.error ?? 'unknown'), { action: 'gym.get', userId, gymId });
        return NextResponse.json({ success: false, error: 'gym_lookup_failed' }, { status: 500 });
      }
      if (!res.data) return NextResponse.json({ success: false, error: 'no_gym' }, { status: 404 });
      return NextResponse.json({
        success: true,
        data: { ...res.data, is_owner: res.data.owner_user_id === userId },
      });
    }

    const fallback = await getGymForUser(supabase, userId);
    if (!fallback.success) {
      logError(new Error(fallback.error ?? 'unknown'), { action: 'gym.get.fallback', userId });
      return NextResponse.json({ success: false, error: 'gym_lookup_failed' }, { status: 500 });
    }
    if (!fallback.data) return NextResponse.json({ success: false, error: 'no_gym' }, { status: 404 });
    return NextResponse.json({
      success: true,
      data: { ...fallback.data, is_owner: fallback.data.owner_user_id === userId },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/gym' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

// ----- PATCH -----

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
    }

    let parsed;
    try {
      parsed = UpdateGymInputSchema.parse(body);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json({ success: false, error: firstZodMessage(error) }, { status: 400 });
      }
      throw error;
    }

    // Resolve gym + verify the caller is the owner.
    const resolveRes = gymId ? await getGym(supabase, gymId) : await getGymForUser(supabase, userId);
    if (!resolveRes.success) {
      logError(new Error(resolveRes.error ?? 'unknown'), { action: 'gym.patch.resolve', userId, gymId });
      return NextResponse.json({ success: false, error: 'gym_lookup_failed' }, { status: 500 });
    }
    const gym = resolveRes.data;
    if (!gym) {
      return NextResponse.json({ success: false, error: 'no_gym' }, { status: 404 });
    }
    if (gym.owner_user_id !== userId) {
      return NextResponse.json({ success: false, error: 'owner_only' }, { status: 403 });
    }

    const updateRes = await updateGym(supabase, gym.id, {
      name: parsed.name,
      timezone: parsed.timezone,
      defaultCurrency: parsed.default_currency,
    });
    if (!updateRes.success) {
      logError(new Error(updateRes.error ?? 'unknown'), {
        action: 'gym.patch.update',
        userId,
        gymId: gym.id,
      });
      const status = updateRes.error === 'no_updates' ? 400 : 500;
      return NextResponse.json({ success: false, error: updateRes.error ?? 'update_failed' }, { status });
    }

    return NextResponse.json({ success: true, data: updateRes.data });
  } catch (error) {
    logError(error, { route: 'PATCH /api/tribe-os/gym' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
