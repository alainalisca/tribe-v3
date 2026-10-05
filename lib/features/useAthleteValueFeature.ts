'use client';

/**
 * Whether one athlete-value feature is on for the person using the app.
 *
 * Asks /api/features/athlete-value (T-AV0 Step 6), the one place a client may
 * learn the flag; the decision is made on the server. Starts false and stays
 * false on any error, so a flagged surface never flashes on and off: FAIL
 * CLOSED, the same rule as the pages.
 */
import { useEffect, useState } from 'react';
import { logError } from '@/lib/logger';

export function useAthleteValueFeature(feature: string): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/features/athlete-value/?feature=${encodeURIComponent(feature)}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const body = (await res.json()) as { enabled?: unknown };
        if (!cancelled) setEnabled(body.enabled === true);
      } catch (error) {
        logError(error, { action: 'useAthleteValueFeature', feature });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [feature]);

  return enabled;
}
