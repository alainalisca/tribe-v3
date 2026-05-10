/**
 * Client-side premium gate for /os/* pages.
 *
 * Mirrors the server-side `requireTribeOSPremium` helper for routes.
 * On mount: fetches the current user, reads their tribe_os_tier +
 * tribe_os_status, and either lets the page render or redirects to
 * the home page's #tribe-os waitlist anchor.
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

export type PremiumGateState = 'checking' | 'allowed' | 'redirecting';

interface PremiumRow {
  tribe_os_tier: 'solo' | 'team_studio' | null;
  tribe_os_status: 'active' | 'past_due' | 'canceled' | 'trialing' | null;
}

function isPremiumActive(row: PremiumRow | null): boolean {
  if (!row || !row.tribe_os_tier) return false;
  const status = row.tribe_os_status;
  return status === null || status === 'active';
}

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
      const { data, error } = await supabase
        .from('users')
        .select('tribe_os_tier, tribe_os_status')
        .eq('id', user.id)
        .single();
      if (cancelled) return;
      if (error || !isPremiumActive(data as PremiumRow | null)) {
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
