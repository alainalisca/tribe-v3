'use client';

import { useEffect, useState } from 'react';
import BottomNav from '@/components/BottomNav';
import { createClient } from '@/lib/supabase/client';

/**
 * T-POLISH1 PR 3b-2 (Al's call 5): the app's tab bar on the public coach (/i)
 * and gym (/g) pages, for a SIGNED-IN viewer only, so tapping a coach inside
 * the app does not feel like leaving it.
 *
 * Renders nothing on the server and on the first client render: the server
 * HTML is the same for everyone (the pages stay cacheable), and a signed-out
 * visitor's page is exactly what it was. Once the browser knows there is a
 * session, the bar mounts -- fixed, so nothing above it moves -- and, with
 * `spacer`, a block of the bar's own height (--bottom-nav-h) after the page so
 * the bar never covers the end of it (the site footer on /i).
 */
export default function SignedInTabBar({ spacer = false }: { spacer?: boolean }) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!cancelled) setSignedIn(!!data.user);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!signedIn) return null;
  return (
    <>
      {spacer && <div aria-hidden="true" data-testid="tab-bar-spacer" style={{ height: 'var(--bottom-nav-h)' }} />}
      <BottomNav />
    </>
  );
}
