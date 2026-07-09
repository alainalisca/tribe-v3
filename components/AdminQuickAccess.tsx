'use client';

/**
 * AdminQuickAccess — fast switcher to /admin for users with is_admin=true.
 *
 * Mounted next to TribeOSQuickAccess + NotificationBell in the home-page
 * header. Visible only when the signed-in user has is_admin=true. For
 * everyone else the component renders nothing.
 *
 * Mirrors the loading-spacer pattern of TribeOSQuickAccess so the header
 * layout doesn't jump on resolve.
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

  if (state === 'loading') {
    return <div className="w-10 h-10" aria-hidden="true" />;
  }
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
