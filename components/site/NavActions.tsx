'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cookieNames, hasAuthCookieName } from '@/lib/site/authCookie';
import { logError } from '@/lib/logger';
import { ArrowUpRight } from './icons';
import StoreButton from './StoreButton';
import UserAvatar from '@/components/UserAvatar';
import c from './chrome.module.css';

type Me = { name: string; avatarUrl: string | null };

/**
 * The nav's right side: "Entrar" (or the signed-in user's avatar, linking to the
 * feed) and "Descarga la app".
 *
 * supabase-js is imported only when an auth cookie exists (lib/site/authCookie),
 * so a first-time visitor never downloads it.
 */
export default function NavActions({
  signIn,
  download,
  myFeed,
  hideDownloadWhenSignedIn = false,
}: {
  signIn: string;
  download: string;
  myFeed: string;
  /**
   * T-POLISH1 PR 3b-2 (Al): on the public coach page a signed-in viewer is
   * already in the app, so "Descarga la app" goes. It goes in the same render
   * that swaps "Entrar" for the avatar, so the header changes once, and the
   * bar's height (and everything under it) never moves.
   */
  hideDownloadWhenSignedIn?: boolean;
}) {
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
          <span className={c.avatar}>
            <UserAvatar
              src={me.avatarUrl}
              name={me.name}
              alt=""
              className="h-full w-full bg-transparent dark:bg-transparent"
              textClassName="text-[11px] text-[#f1efe8] dark:text-[#f1efe8]"
            />
          </span>
        </Link>
      ) : (
        <Link className={c.enter} href="/auth/">
          {signIn}
        </Link>
      )}
      {!(hideDownloadWhenSignedIn && me) && (
        <StoreButton className={c.join}>
          {download}
          <ArrowUpRight />
        </StoreButton>
      )}
    </div>
  );
}
