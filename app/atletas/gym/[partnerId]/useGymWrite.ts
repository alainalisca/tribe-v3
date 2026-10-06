'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DalResult } from '@/lib/dal/types';

/**
 * T-AV26. Run one dashboard write and, when it lands, re-read the server
 * summary with router.refresh(): every number on the page comes from
 * av_athletes_partner_summary, so the page never patches a count itself.
 *
 * `busy` is the key of the write in flight (one at a time); `error` is the
 * key that failed and the function's own error word, for the caller to word.
 */
export function useGymWrite() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ key: string; code: string } | null>(null);

  async function run(key: string, write: () => Promise<DalResult<unknown>>): Promise<boolean> {
    if (busy) return false;
    setBusy(key);
    setError(null);
    const result = await write();
    setBusy(null);
    if (!result.success) {
      setError({ key, code: result.error ?? 'write_failed' });
      return false;
    }
    router.refresh();
    return true;
  }

  return { busy, error, run };
}
