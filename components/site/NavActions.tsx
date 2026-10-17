'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cookieNames, hasAuthCookieName } from '@/lib/site/authCookie';
import { logError } from '@/lib/logger';
import { ArrowUpRight } from './icons';
import StoreButton from './StoreButton';
import c from './chrome.module.css';

type Me = { name: string; avatarUrl: string | null };

/**
 * The nav's right side: "Entrar" (or the signed-in user's avatar, linking to the
 * feed) and "Descarga la app".
 *
 * supabase-js is imported only when an auth cookie exists (lib/site/authCookie),
 * so a first-time visitor never downloads it.
 */
export default function NavActions({ signIn, download, myFeed }: { signIn: string; download: string; myFeed: string }) {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    if (!hasAuthCookieName(cookieNames(document.cookie))) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ createClient }, { fetchUsersByIds }] = await Promise.all([
          import('@/lib/supabase/client'),
          import('@/lib/dal/users'),
        ]);
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        const id = data.session?.user.id;
        if (!id || cancelled) return;
        const res = await fetchUsersByIds(supabase, [id]);
        const row = res.success ? res.data?.[0] : undefined;
        if (!cancelled) setMe({ name: row?.name ?? '', avatarUrl: row?.avatar_url ?? null });
      } catch (error) {
        logError(error, { action: 'siteNav.session' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={c.right}>
      {me ? (
        <Link href="/" aria-label={myFeed}>
          {me.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote avatar of unknown host, 32px
            <img className={c.avatar} src={me.avatarUrl} alt="" width={32} height={32} />
          ) : (
            <span className={c.avatar} aria-hidden="true" />
          )}
        </Link>
      ) : (
        <Link className={c.enter} href="/auth/">
          {signIn}
        </Link>
      )}
      <StoreButton className={c.join}>
        {download}
        <ArrowUpRight />
      </StoreButton>
    </div>
  );
}
