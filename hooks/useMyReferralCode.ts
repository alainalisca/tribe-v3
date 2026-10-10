'use client';

/**
 * The signed-in user's own referral code (TRIBE-XXXXX), for the "Trae a un
 * amigo" card on a joined session and on their profile (T-GROW2 B).
 *
 * Reuses the existing getOrCreateReferralCode (the /referral page's): it inserts
 * a CODE row (referred_id NULL), which is the one client insert migration 215
 * still permits. null while loading, when signed out, or on failure; the card
 * is simply not shown, because a share card with no code is a broken link.
 */
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getOrCreateReferralCode } from '@/lib/dal/referrals';
import { logError } from '@/lib/logger';

export function useMyReferralCode(userId: string | null | undefined): string | null {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setCode(null);
      return;
    }
    let cancelled = false;
    getOrCreateReferralCode(createClient(), userId)
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data) setCode(result.data);
        else logError(new Error(result.error ?? 'no referral code'), { action: 'useMyReferralCode', userId });
      })
      .catch((err) => logError(err, { action: 'useMyReferralCode', userId }));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return code;
}
