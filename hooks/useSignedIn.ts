'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * T-POLISH1 PR 3b-2: whether the browser has a signed-in session, for the
 * public /i and /g pages' signed-in variations (the tab bar, the gym's "Ver
 * próximas clases").
 *
 * false on the server and on the first client render, so the server HTML is
 * the same for everyone and the pages stay cacheable; true once Supabase
 * answers with a user. Never true for a visitor without a session.
 */
export function useSignedIn(): boolean {
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
  return signedIn;
}
