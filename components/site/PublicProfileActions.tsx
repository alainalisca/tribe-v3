'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { followUser, unfollowUser, followNotificationMessage } from '@/lib/dal/promote';
import { logError } from '@/lib/logger';
import { showError, showSuccess } from '@/lib/toast';
import { signInHref } from '@/lib/site/publicProfile';
import InterestButton from '@/components/instructor/InterestButton';
import BlockReportControls from '@/components/BlockReportControls';
import s from './publicProfileActions.module.css';

/**
 * T-POLISH1 PR 3b-1: the storefront's actions on the public coach (/i) and gym
 * (/g) pages -- Enviar mensaje, Seguir, Estoy interesado (coaches only),
 * Bloquear / Reportar.
 *
 * ONE CLIENT ISLAND, SO THE SERVER HTML IS THE SAME FOR EVERYONE. The server
 * renders the signed-out version: three links to sign-in with a returnTo, and
 * no Bloquear / Reportar. After hydration the browser asks Supabase who the
 * visitor is and, for a signed-in visitor, swaps in the live controls. Nothing
 * per-viewer is ever server-rendered, so the public pages stay cacheable.
 *
 * Signed in, every control does what /storefront does, through the same DAL
 * calls: /messages?user=<id> (get_or_create_direct_conversation), followUser /
 * unfollowUser with the follow notification, InterestButton's
 * expressInterest + /api/instructor/notify-interest, BlockReportControls. Hidden
 * entirely for the account's owner.
 */

export type PublicProfileActionLabels = {
  message: string;
  follow: string;
  following: string;
  interested: string;
};

type Props = {
  /** The account the actions act on: the coach, or the gym's owner account. */
  targetId: string;
  /** The account's name, for the interest form ("¿Interesado en entrenar con …?"). */
  targetName: string;
  /** This page's path, where sign-in returns the visitor. */
  pagePath: string;
  /** Estoy interesado: coaches only. */
  showInterest: boolean;
  specialties?: string[];
  labels: PublicProfileActionLabels;
  language: 'es' | 'en';
  /** 'site' on /i (the Jornada frame), 'app' on /g (theme tokens). */
  variant: 'site' | 'app';
};

const APP = {
  wrap: 'flex flex-col gap-2',
  row: 'flex gap-2',
  primary:
    'flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-tribe-green px-4 py-3 text-sm font-bold text-slate-900 hover:brightness-110 transition',
  secondary:
    'flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-theme px-4 py-3 text-sm font-semibold text-theme-primary transition',
  tertiary: 'w-full rounded-xl border border-theme px-4 py-2.5 text-sm font-semibold text-theme-primary',
  sent: 'w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm text-theme-tertiary',
  report: 'mt-1',
};

const SITE = {
  wrap: s.wrap,
  row: s.row,
  primary: s.primary,
  secondary: s.secondary,
  tertiary: s.tertiary,
  sent: s.sent,
  report: s.report,
};

export default function PublicProfileActions({
  targetId,
  targetName,
  pagePath,
  showInterest,
  specialties = [],
  labels,
  language,
  variant,
}: Props) {
  const c = variant === 'site' ? SITE : APP;
  const supabase = useMemo(() => createClient(), []);
  // undefined: not known yet (the server render and the first client render);
  // null: signed out; a string: the signed-in viewer.
  const [viewerId, setViewerId] = useState<string | null | undefined>(undefined);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!cancelled) setViewerId(data.user?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setViewerId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!viewerId || viewerId === targetId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('user_follows')
        .select('follower_id')
        .eq('follower_id', viewerId)
        .eq('following_id', targetId)
        .maybeSingle();
      if (!cancelled && !error) setFollowing(!!data);
    })();
    return () => {
      cancelled = true;
    };
  }, [viewerId, targetId, supabase]);

  const messagePath = `/messages/?user=${targetId}`;
  const signedIn = typeof viewerId === 'string';

  if (signedIn && viewerId === targetId) return null;

  async function toggleFollow() {
    if (!viewerId || followBusy) return;
    const was = following;
    setFollowBusy(true);
    setFollowing(!was);
    try {
      if (was) {
        const result = await unfollowUser(supabase, viewerId, targetId);
        if (!result.success) throw new Error(result.error ?? 'Unfollow failed');
        showSuccess(language === 'es' ? 'Dejaste de seguir' : 'Unfollowed');
      } else {
        const { data: authData } = await supabase.auth.getUser();
        const followerName =
          authData.user?.user_metadata?.name || authData.user?.email || (language === 'es' ? 'Alguien' : 'Someone');
        const result = await followUser(
          supabase,
          viewerId,
          targetId,
          followNotificationMessage(followerName, language)
        );
        if (!result.success) throw new Error(result.error ?? 'Follow failed');
        showSuccess(language === 'es' ? 'Ahora sigues' : 'Following');
      }
    } catch (err) {
      setFollowing(was);
      logError(err, { action: 'PublicProfileActions.toggleFollow', targetId });
      showError(language === 'es' ? 'No se pudo actualizar el seguimiento.' : 'Could not update follow.');
    } finally {
      setFollowBusy(false);
    }
  }

  return (
    <div className={c.wrap} data-testid="public-profile-actions" data-viewer={signedIn ? 'in' : 'out'}>
      <div className={c.row}>
        <Link href={signedIn ? messagePath : signInHref(messagePath)} className={c.primary}>
          <MessageCircle className="w-4 h-4" aria-hidden="true" />
          {labels.message}
        </Link>
        {signedIn ? (
          <button
            type="button"
            onClick={toggleFollow}
            disabled={followBusy}
            aria-pressed={following}
            className={c.secondary}
          >
            {following ? labels.following : labels.follow}
          </button>
        ) : (
          <Link href={signInHref(pagePath)} className={c.secondary}>
            {labels.follow}
          </Link>
        )}
      </div>

      {showInterest &&
        (signedIn ? (
          <InterestButton
            athleteId={viewerId}
            instructorId={targetId}
            instructorName={targetName}
            specialties={specialties}
            language={language}
            bare={{ className: c.tertiary, sentClassName: c.sent }}
          />
        ) : (
          <Link href={signInHref(pagePath)} className={c.tertiary}>
            {labels.interested}
          </Link>
        ))}

      {signedIn && (
        <div className={c.report}>
          <BlockReportControls targetUserId={targetId} viewerId={viewerId} />
        </div>
      )}
    </div>
  );
}
