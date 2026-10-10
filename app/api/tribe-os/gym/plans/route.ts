/**
 * /api/tribe-os/gym/plans
 *   GET  — list gym_plans for the caller's gym + distinct plan names from clients
 *   POST — upsert a gym_plan (owner only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { logError } from '@/lib/logger';
import { requireTribeOSPremium } from '@/lib/auth/premium';
import { getGym, getGymForUser } from '@/lib/dal/gyms';

const UpsertPlanSchema = z.object({
  name: z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(1, 'Plan name is required').max(80, 'Plan name too long')),
  price_cents: z.number().int().min(0, 'Price must be >= 0'),
  currency: z.enum(['COP', 'USD']),
  duration_months: z.number().int().min(1).max(24),
});

export async function GET(): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  if (!gymId) {
    return NextResponse.json({ success: false, error: 'gym_required' }, { status: 400 });
  }

  try {
    const [plansRes, clientPlansRes, gymRes] = await Promise.all([
      supabase
        .from('gym_plans')
        .select('id, gym_id, name, price_cents, currency, duration_months, created_at, updated_at')
        .eq('gym_id', gymId)
        .order('name', { ascending: true }),
      supabase
        .from('clients')
        .select('membership_plan')
        .eq('gym_id', gymId)
        .not('membership_plan', 'is', null),
      gymId ? getGym(supabase, gymId) : getGymForUser(supabase, userId),
    ]);

    if (plansRes.error) throw plansRes.error;
    if (clientPlansRes.error) throw clientPlansRes.error;

    const plans = plansRes.data ?? [];

    const distinctNames = new Set<string>();
    for (const row of clientPlansRes.data ?? []) {
      const trimmed = (row.membership_plan as string | null)?.trim();
      if (trimmed) distinctNames.add(trimmed);
    }

    const gym = gymRes.success ? gymRes.data : null;
    const isOwner = !!gym && gym.owner_user_id === userId;

    return NextResponse.json({
      success: true,
      data: {
        plans,
        clientPlanNames: Array.from(distinctNames).sort((a, b) => a.localeCompare(b, 'es')),
        gymCurrency: gym?.default_currency ?? 'COP',
        isOwner,
      },
    });
  } catch (error) {
    logError(error, { route: 'GET /api/tribe-os/gym/plans' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const gate = await requireTribeOSPremium();
  if (!gate.ok) return gate.response;
  const { supabase, userId, gymId } = gate;

  if (!gymId) {
    return NextResponse.json({ success: false, error: 'gym_required' }, { status: 400 });
  }

  try {
    const gymRes = gymId ? await getGym(supabase, gymId) : await getGymForUser(supabase, userId);
    if (!gymRes.success || !gymRes.data) {
      return NextResponse.json({ success: false, error: 'gym_not_found' }, { status: 404 });
    }
    if (gymRes.data.owner_user_id !== userId) {
      return NextResponse.json({ success: false, error: 'owner_only' }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
    }

    let parsed;
    try {
      parsed = UpsertPlanSchema.parse(body);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json(
          { success: false, error: error.issues[0]?.message ?? 'Invalid input' },
          { status: 400 }
        );
      }
      throw error;
    }

    const existing = await supabase
      .from('gym_plans')
      .select('id')
      .eq('gym_id', gymId)
      .ilike('name', parsed.name)
      .maybeSingle();

    if (existing.data) {
      const { data, error } = await supabase
        .from('gym_plans')
        .update({
          name: parsed.name,
          price_cents: parsed.price_cents,
          currency: parsed.currency,
          duration_months: parsed.duration_months,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.data.id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, data });
    }

    const { data, error } = await supabase
      .from('gym_plans')
      .insert({
        gym_id: gymId,
        name: parsed.name,
        price_cents: parsed.price_cents,
        currency: parsed.currency,
        duration_months: parsed.duration_months,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    logError(error, { route: 'POST /api/tribe-os/gym/plans' });
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
