/**
 * Client-side premium gate for /os/* pages.
 *
 * Mirrors the server-side `requireTribeOSPremium` helper for routes.
 * On mount: fetches the current user, resolves their Tribe.OS premium
 * status via the gym-aware resolver (owned gym → coached gym → legacy
 * users.tribe_os_* row), and either lets the page render or redirects
 * to the home page's #tribe-os waitlist anchor.
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
import { useRouter } from 'next/navigation';
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
          router.replace('/#tribe-os');
        }
        return;
      }
      const result = await getTribeOSPremiumStatusForUser(supabase, user.id);
      if (cancelled) return;
      if (!result.success || !result.data?.active) {
        setState('redirecting');
        router.replace('/#tribe-os');
        return;
      }
      setUserId(user.id);
      setState('allowed');
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return { state, userId };
}
