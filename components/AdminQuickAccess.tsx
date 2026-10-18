'use client';

/**
 * AdminQuickAccess: the admin shield, a fast switcher to /admin.
 *
 * Mounted in the signed-in app header (components/home/FilterBar.tsx) next to
 * TribeOSQuickAccess and NotificationBell. Restored 2026-10-18 (Al) after
 * T-JOIN1 Part C took it out. Shown only when the database says the signed-in
 * user is an admin: is_app_admin(), a SECURITY DEFINER function on the
 * caller's own session (users.is_admin is not client-readable, migration
 * 113). Signed out, not an admin, or the check fails: nothing renders. Never
 * in the public site header (components/site/), which does not import it.
 *
 * Nothing renders while the check runs either: a spacer would leave an empty
 * gap in every non-admin's header.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { fetchUserIsAdmin } from '@/lib/dal';
import { useLanguage } from '@/lib/LanguageContext';

type State = 'loading' | 'hidden' | 'active';

export default function AdminQuickAccess() {
  const { language } = useLanguage();
  const [state, setState] = useState<State>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setState('hidden');
        return;
      }
      // is_admin is not client-readable (migration 113); resolve via the DAL,
      // which uses the is_app_admin() RPC for the current user.
      const adminResult = await fetchUserIsAdmin(supabase, user.id);
      if (cancelled) return;
      if (!adminResult.success || !adminResult.data) {
        setState('hidden');
        return;
      }
      setState('active');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state !== 'active') return null;

  const label = language === 'es' ? 'Panel de Admin' : 'Admin Panel';
  return (
    <Link
      href="/admin"
      aria-label={label}
      title={label}
      className="relative w-10 h-10 flex items-center justify-center rounded-full bg-blue-500/20 hover:bg-blue-500/30 transition-colors"
    >
      <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" />
    </Link>
  );
}
