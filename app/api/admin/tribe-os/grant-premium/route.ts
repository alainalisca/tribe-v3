/**
 * POST /api/admin/tribe-os/grant-premium
 *
 * Admin-only endpoint for flipping a user (typically a Studio San Diego
 * design partner) onto a Tribe.OS premium tier without going through
 * Stripe billing. Mirrors the admin pattern from
 * /api/admin/users/[id]/delete: isAdmin() at the gate, service-role
 * client for the actual write so RLS can stay strict on `users`.
 *
 * Body: { email: string, tier: 'solo' | 'team_studio' }
 * Response: 200 { success: true, userId, ...premiumFields } or 4xx with { error }.
 *
 * Companion CLI: scripts/grant-tribe-os-premium.js (uses the service-role
 * client directly without going through this route, for terminal use).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isAdmin } from '@/lib/admin';
import { logError } from '@/lib/logger';
import { grantTribeOSPremium, revokeTribeOSPremium, type TribeOSTier } from '@/lib/dal/tribeOSPremium';
import { createClient } from '@/lib/supabase/server';

const VALID_TIERS: ReadonlySet<TribeOSTier> = new Set(['solo', 'team_studio']);

interface GrantBody {
  email?: unknown;
  tier?: unknown;
  revoke?: unknown;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authorized = await isAdmin();
    if (!authorized) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 403 });
    }

    let body: GrantBody;
    try {
      body = (await request.json()) as GrantBody;
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) {
      return NextResponse.json({ error: 'email_required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
    }
    const service = createServiceClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Capture the calling admin's email for the audit trail.
    const userClient = await createClient();
    const {
      data: { user: callingAdmin },
    } = await userClient.auth.getUser();
    const grantedBy = callingAdmin?.email ?? 'unknown_admin';

    if (body.revoke === true) {
      const result = await revokeTribeOSPremium(service, email);
      if (!result.success) {
        return NextResponse.json(
          { error: result.error ?? 'revoke_failed' },
          {
            status: result.error === 'user_not_found' ? 404 : 500,
          }
        );
      }
      return NextResponse.json({ success: true, action: 'revoke', userId: result.data?.userId });
    }

    const tierRaw = typeof body.tier === 'string' ? body.tier : '';
    if (!VALID_TIERS.has(tierRaw as TribeOSTier)) {
      return NextResponse.json({ error: 'invalid_tier' }, { status: 400 });
    }
    const tier = tierRaw as TribeOSTier;

    const result = await grantTribeOSPremium(service, email, tier, grantedBy);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? 'grant_failed' },
        {
          status: result.error === 'user_not_found' ? 404 : 500,
        }
      );
    }

    return NextResponse.json({ success: true, action: 'grant', ...result.data });
  } catch (error) {
    logError(error, { route: '/api/admin/tribe-os/grant-premium' });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
