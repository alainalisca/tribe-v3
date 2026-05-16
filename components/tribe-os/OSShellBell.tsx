'use client';

/**
 * OSShellBell — the bell button in the Tribe.OS top bar.
 *
 * Previously rendered as a static <button> with a hardcoded red dot
 * that lied about the actual state of the gym. Now:
 *   - Click navigates to /os/intelligence (where the alerts live)
 *   - Badge reflects the real active-insight count
 *   - Shows nothing when there are zero active insights (dot hides
 *     gracefully so a clean inbox doesn't carry a fake red signal)
 *
 * Fetch strategy: one request on mount per OS shell instance. Since
 * OSShell wraps every /os/* page, this fires once per session and
 * stays cached in component state for the user's time inside Tribe.OS.
 * If we later need precise real-time accuracy, an interval poll
 * (like NotificationBell on the consumer side) can land here too.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';

interface Props {
  ariaLabel: string;
}

type State = { kind: 'loading' } | { kind: 'ready'; count: number };

export default function OSShellBell({ ariaLabel }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Same endpoint the dashboard insights banner uses. Server
        // already filters to active + un-dismissed insights so the
        // count maps directly to "things that need my attention."
        const res = await fetch('/api/tribe-os/intelligence/', { method: 'GET' });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { insights?: Array<unknown> };
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setState({ kind: 'ready', count: 0 });
          return;
        }
        setState({ kind: 'ready', count: body.data.insights?.length ?? 0 });
      } catch {
        if (!cancelled) setState({ kind: 'ready', count: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const count = state.kind === 'ready' ? state.count : 0;
  const showBadge = count > 0;

  return (
    <Link
      href="/os/intelligence"
      aria-label={ariaLabel}
      title={ariaLabel}
      className="relative w-9 h-9 inline-flex items-center justify-center text-tribe-dark-80 hover:text-tribe-dark rounded-full hover:bg-tribe-dark-40 transition-colors"
    >
      <Bell className="w-5 h-5" />
      {showBadge ? (
        // Small numeric badge when count is 1-9, "9+" beyond. Keeps
        // the bell's bounding box tight so it doesn't push the
        // adjacent help button.
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 inline-flex items-center justify-center bg-tribe-danger text-white text-[10px] font-bold rounded-full ring-2 ring-white">
          {count > 9 ? '9+' : count}
        </span>
      ) : null}
    </Link>
  );
}
