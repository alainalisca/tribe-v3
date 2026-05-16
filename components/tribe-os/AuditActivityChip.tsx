'use client';

/**
 * Small dashboard chip that surfaces unseen audit activity since the
 * user last opened /os/audit. Renders nothing when there are zero
 * new entries (no chrome, no placeholder) so a quiet gym doesn't
 * see anything.
 *
 * Persistence model:
 *   - localStorage key `tribe_os_audit_last_viewed` holds an ISO
 *     timestamp of the last time the user opened /os/audit.
 *   - First-ever load: we set the timestamp to "now" without
 *     showing anything. Otherwise a brand-new user with a busy
 *     gym would see "47 new audit entries" on first dashboard
 *     load — bad signal.
 *   - /os/audit sets the timestamp on mount so a return to the
 *     dashboard shows zero new.
 *
 * Suppression-row noise is filtered out server-side — the
 * watchdog's gym.alert_sent rows don't count toward "new
 * activity" because they aren't user-initiated.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ScrollText } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

const STORAGE_KEY = 'tribe_os_audit_last_viewed';

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    label: (n: number) => `${n} new audit ${n === 1 ? 'entry' : 'entries'} since you last looked`,
    aria: 'View new audit activity',
  },
  es: {
    label: (n: number) =>
      `${n} ${n === 1 ? 'nueva entrada de auditoría' : 'nuevas entradas de auditoría'} desde tu última visita`,
    aria: 'Ver nueva actividad de auditoría',
  },
} as const;

export default function AuditActivityChip() {
  const { language } = useLanguage();
  const s = copy[language];
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Read or seed the last-viewed timestamp. Seeding on first
        // load to "now" prevents the chip from claiming a giant
        // backlog the user has never been able to see.
        if (typeof window === 'undefined') return;
        let since: string | null = window.localStorage.getItem(STORAGE_KEY);
        if (!since) {
          since = new Date().toISOString();
          window.localStorage.setItem(STORAGE_KEY, since);
          // No need to fetch — the count will be zero by definition.
          if (!cancelled) setCount(0);
          return;
        }

        const url = `/api/tribe-os/audit/count?since=${encodeURIComponent(since)}`;
        const res = await fetch(url, { method: 'GET' });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { count: number };
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          // Quiet failure — the chip is non-critical. We don't
          // want a transient error to block the dashboard.
          setCount(0);
          return;
        }
        setCount(body.data.count);
      } catch {
        if (!cancelled) setCount(0);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (count === null || count === 0) return null;

  return (
    <Link
      href="/os/audit"
      aria-label={s.aria}
      onClick={() => {
        // Stamp NOW so the chip clears when the user clicks through.
        // /os/audit's own mount will re-stamp; this catches the
        // double-fast-click race where the dashboard would otherwise
        // show the chip for a beat after the user navigated away.
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
        }
      }}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-tribe-warning/10 border border-tribe-warning/40 text-tribe-warning text-xs font-semibold rounded-full hover:bg-tribe-warning/20 transition-colors"
    >
      <ScrollText className="w-3.5 h-3.5" />
      {s.label(count)}
    </Link>
  );
}

/**
 * Helper for the /os/audit page to stamp the last-viewed time on
 * mount. Idempotent + safe to call from a useEffect.
 */
export function markAuditViewed(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
}
