/**
 * Client-side premium gate for /os/* pages.
 *
 * Mirrors the server-side `requireTribeOSPremium` helper for routes.
 * On mount: fetches the current user, resolves their Tribe.OS premium
 * status via the gym-aware resolver (owned gym → coached gym → legacy
 * users.tribe_os_* row), then:
 *   - not signed in  → /auth?returnTo=<path> (preserves intent)
 *   - signed in, not premium → /os/dashboard (the ONE canonical upsell
 *     surface; it renders the inline UpgradeCard). Previously every
 *     gated page bounced to the /#tribe-os marketing anchor with a
 *     bare "Redirecting…" and no upgrade path — 15 different dead-ends.
 *     Routing them to the dashboard gives one consistent contextual
 *     upgrade experience without duplicating UpgradeCard 15×.
 *   - premium → render.
 *
 * IMPORTANT: this MUST use `getTribeOSPremiumStatusForUser` (the same
 * resolver the server-side `requireTribeOSPremium` uses) and NOT a raw
 * `users.tribe_os_*` read. A non-owner coach at a premium gym has no
 * legacy users-column premium — their access comes from `gym_coaches`.
 * Reading only the users row wrongly bounced them to /#tribe-os even
 * though the server gate let them through. (Fixed post-launch hotfix.)
 *
 * Usage:
 *
 *   const { state, userId } = useTribeOSPremiumGate();
 *   if (state !== 'allowed') {
 *     return <PremiumGateLoadingState state={state} />;
 *   }
 *   // ...page content, userId is guaranteed non-null...
 */
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getTribeOSPremiumStatusForUser } from '@/lib/dal/tribeOSPremium';

export type PremiumGateState = 'checking' | 'allowed' | 'redirecting';

export interface PremiumGateResult {
  state: PremiumGateState;
  /** Set when state === 'allowed'. Null otherwise. */
  userId: string | null;
}

export function useTribeOSPremiumGate(): PremiumGateResult {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<PremiumGateState>('checking');
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setState('redirecting');
          const returnTo = encodeURIComponent(pathname || '/os/dashboard');
          router.replace(`/auth?returnTo=${returnTo}`);
        }
        return;
      }
      const result = await getTribeOSPremiumStatusForUser(supabase, user.id);
      if (cancelled) return;
      if (!result.success || !result.data?.active) {
        // One canonical upsell surface — the dashboard renders the
        // inline UpgradeCard. No more 15 different /#tribe-os dead-ends.
        setState('redirecting');
        router.replace('/os/dashboard');
        return;
      }
      setUserId(user.id);
      setState('allowed');
    })();
    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

  return { state, userId };
}
