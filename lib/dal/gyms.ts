/**
 * DAL: Tribe.OS gyms (multi-coach premium tenant).
 *
 * Introduced by migration 068 (additive schema) + 069 (backfill).
 * A gym is the unit of Tribe.OS billing and tenant ownership. Each
 * gym has one owner and zero or more additional coaches via
 * gym_coaches (see lib/dal/gymCoaches.ts).
 *
 * Inline TypeScript types — `gyms` is not yet present in
 * lib/database.types.ts. Same pattern as lib/dal/tribeOSWaitlist.ts:
 * once the schema stabilizes and types are regenerated, swap the
 * inline definitions for `Database['public']['Tables']['gyms']`.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { logError } from '@/lib/logger';
import type { DalResult } from './types';
import type { TribeOSTier, TribeOSStatus } from './tribeOSPremium';

export type GymCurrency = 'USD' | 'COP';
export type GymCoachRole = 'owner' | 'coach' | 'assistant';

/** Mirror of the gyms table columns. */
export interface GymRow {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  tribe_os_status: TribeOSStatus | null;
  tribe_os_tier: TribeOSTier | null;
  tribe_os_stripe_customer_id: string | null;
  tribe_os_stripe_subscription_id: string | null;
  tribe_os_granted_at: string | null;
  tribe_os_granted_by: string | null;
  timezone: string;
  default_currency: GymCurrency | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateGymInput {
  name: string;
  slug?: string;
  ownerUserId: string;
  tier?: TribeOSTier | null;
  status?: TribeOSStatus | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  grantedAt?: string | null;
  grantedBy?: string | null;
  timezone?: string;
  defaultCurrency?: GymCurrency | null;
}

export interface UpdateGymInput {
  name?: string;
  slug?: string;
  timezone?: string;
  defaultCurrency?: GymCurrency | null;
  tier?: TribeOSTier | null;
  status?: TribeOSStatus | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  grantedAt?: string | null;
  grantedBy?: string | null;
}

const GYM_SELECT =
  'id, name, slug, owner_user_id, tribe_os_status, tribe_os_tier, tribe_os_stripe_customer_id, tribe_os_stripe_subscription_id, tribe_os_granted_at, tribe_os_granted_by, timezone, default_currency, created_at, updated_at, deleted_at';

/**
 * Generate a slug from a display name. Lowercases, scrubs non
 * [a-z0-9-] characters, collapses runs of dashes, and appends a
 * short hash for uniqueness. Caller passes a uniqueness seed
 * (typically the owner user id) so re-running on the same input
 * produces the same slug. Mirrors the slug derivation in
 * migration 069 so DB and app stay aligned.
 */
export function deriveGymSlug(name: string, uniquenessSeed: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const safeBase = base.length > 0 ? base : 'gym';
  // Deterministic 6-char suffix. md5-equivalent via a tiny hash.
  // We don't need cryptographic strength; we need stability + low
  // collision risk across the ~hundreds of gyms we'll see.
  const suffix = simpleHash6(uniquenessSeed);
  return `${safeBase}-${suffix}`.slice(0, 80);
}

function simpleHash6(input: string): string {
  // FNV-1a 32-bit, hex-encoded, first 6 chars. Stable, no deps.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0').slice(0, 6);
}

/**
 * Create a new gym. Caller becomes the owner. Does NOT insert into
 * gym_coaches — that's a separate step (lib/dal/gymCoaches.ts
 * addCoachToGym) so the caller can opt out of the coach row (e.g.
 * service-role one-off provisioning where the owner is a placeholder).
 *
 * If slug is omitted, derives one from the name + owner id pair so
 * re-creating with the same inputs produces the same slug.
 */
export async function createGym(supabase: SupabaseClient, input: CreateGymInput): Promise<DalResult<GymRow>> {
  try {
    const slug = input.slug ?? deriveGymSlug(input.name, input.ownerUserId);
    const { data, error } = await supabase
      .from('gyms')
      .insert({
        name: input.name,
        slug,
        owner_user_id: input.ownerUserId,
        tribe_os_tier: input.tier ?? null,
        tribe_os_status: input.status ?? null,
        tribe_os_stripe_customer_id: input.stripeCustomerId ?? null,
        tribe_os_stripe_subscription_id: input.stripeSubscriptionId ?? null,
        tribe_os_granted_at: input.grantedAt ?? null,
        tribe_os_granted_by: input.grantedBy ?? null,
        timezone: input.timezone ?? 'America/Bogota',
        default_currency: input.defaultCurrency ?? null,
      })
      .select(GYM_SELECT)
      .single();

    if (error) {
      logError(error, { action: 'createGym', ownerUserId: input.ownerUserId });
      return { success: false, error: error.message };
    }
    return { success: true, data: data as GymRow };
  } catch (error) {
    logError(error, { action: 'createGym', ownerUserId: input.ownerUserId });
    return { success: false, error: 'Failed to create gym' };
  }
}

/** Fetch a gym by id. Returns success+null when RLS hides it or absent. */
export async function getGym(supabase: SupabaseClient, gymId: string): Promise<DalResult<GymRow | null>> {
  try {
    const { data, error } = await supabase.from('gyms').select(GYM_SELECT).eq('id', gymId).maybeSingle();

    if (error) {
      logError(error, { action: 'getGym', gymId });
      return { success: false, error: error.message };
    }
    return { success: true, data: (data as GymRow | null) ?? null };
  } catch (error) {
    logError(error, { action: 'getGym', gymId });
    return { success: false, error: 'Failed to fetch gym' };
  }
}

/**
 * Get the user's primary gym. Resolution order:
 *   1. A gym the user owns (gyms.owner_user_id = userId).
 *   2. The first gym the user is a coach in (by created_at asc).
 *
 * Returns success+null if the user has no gym at all (still on the
 * legacy instructor-tenant path, or not a Tribe.OS user). Mission 6's
 * checkout flow synthesizes a gym for the user before charging, so
 * null after that point means truly never-subscribed.
 */
export async function getGymForUser(supabase: SupabaseClient, userId: string): Promise<DalResult<GymRow | null>> {
  try {
    // Owner lookup first — cheaper, single-table query.
    const owned = await supabase
      .from('gyms')
      .select(GYM_SELECT)
      .eq('owner_user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (owned.error) {
      logError(owned.error, { action: 'getGymForUser.owned', userId });
      return { success: false, error: owned.error.message };
    }
    if (owned.data) {
      return { success: true, data: owned.data as GymRow };
    }

    // Fall back to coach membership.
    const coached = await supabase
      .from('gym_coaches')
      .select(`gym:gyms(${GYM_SELECT})`)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (coached.error) {
      logError(coached.error, { action: 'getGymForUser.coach', userId });
      return { success: false, error: coached.error.message };
    }

    // Same FK-join cast as listGymsForUser.
    const row = coached.data as unknown as { gym: GymRow | null } | null;
    return { success: true, data: row?.gym ?? null };
  } catch (error) {
    logError(error, { action: 'getGymForUser', userId });
    return { success: false, error: 'Failed to fetch gym for user' };
  }
}

/**
 * All gyms the user belongs to (owner or coach). Used by the future
 * gym switcher in the OS shell. Ordered by created_at asc so the
 * user's longest-lived gym is first.
 */
export async function listGymsForUser(supabase: SupabaseClient, userId: string): Promise<DalResult<GymRow[]>> {
  try {
    // Two queries union'd in JS to avoid the Supabase JS client's
    // limitation around OR across two tables. Bounded at one
    // round-trip per source.
    const ownedQ = supabase.from('gyms').select(GYM_SELECT).eq('owner_user_id', userId).is('deleted_at', null);

    const coachedQ = supabase.from('gym_coaches').select(`gym:gyms(${GYM_SELECT})`).eq('user_id', userId);

    const [owned, coached] = await Promise.all([ownedQ, coachedQ]);
    if (owned.error) {
      logError(owned.error, { action: 'listGymsForUser.owned', userId });
      return { success: false, error: owned.error.message };
    }
    if (coached.error) {
      logError(coached.error, { action: 'listGymsForUser.coach', userId });
      return { success: false, error: coached.error.message };
    }

    const byId = new Map<string, GymRow>();
    for (const row of (owned.data ?? []) as GymRow[]) {
      byId.set(row.id, row);
    }
    // Supabase JS typegen models foreign-key joins as arrays; at
    // runtime gym_coaches.gym is a single object (many-to-one).
    // Cast through unknown to align the types with reality.
    const coachRows = (coached.data ?? []) as unknown as Array<{ gym: GymRow | null }>;
    for (const row of coachRows) {
      if (row.gym && !byId.has(row.gym.id)) {
        byId.set(row.gym.id, row.gym);
      }
    }
    const all = Array.from(byId.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
    return { success: true, data: all };
  } catch (error) {
    logError(error, { action: 'listGymsForUser', userId });
    return { success: false, error: 'Failed to list gyms for user' };
  }
}

/** Lookup by Stripe subscription id. Webhook handler hot path. */
export async function getGymByStripeSubscriptionId(
  supabase: SupabaseClient,
  stripeSubscriptionId: string
): Promise<DalResult<GymRow | null>> {
  try {
    const { data, error } = await supabase
      .from('gyms')
      .select(GYM_SELECT)
      .eq('tribe_os_stripe_subscription_id', stripeSubscriptionId)
      .maybeSingle();

    if (error) {
      logError(error, {
        action: 'getGymByStripeSubscriptionId',
        stripeSubscriptionId,
      });
      return { success: false, error: error.message };
    }
    return { success: true, data: (data as GymRow | null) ?? null };
  } catch (error) {
    logError(error, {
      action: 'getGymByStripeSubscriptionId',
      stripeSubscriptionId,
    });
    return { success: false, error: 'Failed to fetch gym by subscription id' };
  }
}

/** Lookup by Stripe customer id. Used during checkout-session backfill. */
export async function getGymByStripeCustomerId(
  supabase: SupabaseClient,
  stripeCustomerId: string
): Promise<DalResult<GymRow | null>> {
  try {
    const { data, error } = await supabase
      .from('gyms')
      .select(GYM_SELECT)
      .eq('tribe_os_stripe_customer_id', stripeCustomerId)
      .maybeSingle();

    if (error) {
      logError(error, { action: 'getGymByStripeCustomerId', stripeCustomerId });
      return { success: false, error: error.message };
    }
    return { success: true, data: (data as GymRow | null) ?? null };
  } catch (error) {
    logError(error, { action: 'getGymByStripeCustomerId', stripeCustomerId });
    return { success: false, error: 'Failed to fetch gym by customer id' };
  }
}

/** Partial update. At least one field must be present. */
export async function updateGym(
  supabase: SupabaseClient,
  gymId: string,
  updates: UpdateGymInput
): Promise<DalResult<GymRow>> {
  try {
    const payload: Record<string, unknown> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.slug !== undefined) payload.slug = updates.slug;
    if (updates.timezone !== undefined) payload.timezone = updates.timezone;
    if (updates.defaultCurrency !== undefined) payload.default_currency = updates.defaultCurrency;
    if (updates.tier !== undefined) payload.tribe_os_tier = updates.tier;
    if (updates.status !== undefined) payload.tribe_os_status = updates.status;
    if (updates.stripeCustomerId !== undefined) payload.tribe_os_stripe_customer_id = updates.stripeCustomerId;
    if (updates.stripeSubscriptionId !== undefined)
      payload.tribe_os_stripe_subscription_id = updates.stripeSubscriptionId;
    if (updates.grantedAt !== undefined) payload.tribe_os_granted_at = updates.grantedAt;
    if (updates.grantedBy !== undefined) payload.tribe_os_granted_by = updates.grantedBy;

    if (Object.keys(payload).length === 0) {
      return { success: false, error: 'no_updates' };
    }

    const { data, error } = await supabase.from('gyms').update(payload).eq('id', gymId).select(GYM_SELECT).single();

    if (error) {
      logError(error, { action: 'updateGym', gymId });
      return { success: false, error: error.message };
    }
    return { success: true, data: data as GymRow };
  } catch (error) {
    logError(error, { action: 'updateGym', gymId });
    return { success: false, error: 'Failed to update gym' };
  }
}
