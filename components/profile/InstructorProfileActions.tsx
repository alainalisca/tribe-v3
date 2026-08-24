'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isFollowing as fetchIsFollowing, followUser, unfollowUser, followNotificationMessage } from '@/lib/dal';
import { showSuccess, showError } from '@/lib/toast';
import { logError } from '@/lib/logger';

interface InstructorProfileActionsProps {
  currentUserId: string;
  instructorId: string;
  language: 'en' | 'es';
}

/**
 * Instructor-facing actions on /profile/[userId]. Instructors are a directory
 * listing an athlete reaches out to, so this mirrors the storefront's model
 * (StorefrontProfileColumn) instead of the athlete-to-athlete connection funnel:
 * a direct Message (DMs are open server-side via get_or_create_direct_conversation)
 * and a Follow control routed through the promote DAL. Rendered only when the
 * profile owner is_instructor; athlete-to-athlete profiles keep ConnectionButton.
 */
export default function InstructorProfileActions({
  currentUserId,
  instructorId,
  language,
}: InstructorProfileActionsProps) {
  const supabase = createClient();
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchIsFollowing(supabase, currentUserId, instructorId);
      if (!cancelled && res.success) setFollowing(!!res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, instructorId, supabase]);

  async function handleFollowToggle() {
    if (busy) return;
    setBusy(true);
    const wasFollowing = following;
    setFollowing(!wasFollowing); // optimistic
    try {
      // Route through the DAL so a 0-row (RLS-blocked) write surfaces as a
      // failure instead of a silent success that reverts on reload (BUG-215).
      let result;
      if (wasFollowing) {
        result = await unfollowUser(supabase, currentUserId, instructorId);
      } else {
        // Notify the instructor that this athlete followed them.
        const { data: authData } = await supabase.auth.getUser();
        const followerName =
          authData.user?.user_metadata?.name || authData.user?.email || (language === 'es' ? 'Alguien' : 'Someone');
        result = await followUser(
          supabase,
          currentUserId,
          instructorId,
          followNotificationMessage(followerName, language)
        );
      }
      if (!result.success) throw new Error(result.error ?? 'Follow update failed');
      showSuccess(
        wasFollowing
          ? language === 'es'
            ? 'Dejaste de seguir'
            : 'Unfollowed'
          : language === 'es'
            ? 'Ahora sigues'
            : 'Following'
      );
    } catch (err) {
      setFollowing(wasFollowing); // rollback
      logError(err, { action: 'InstructorProfileActions.handleFollowToggle', instructorId });
      showError(language === 'es' ? 'No se pudo actualizar el seguimiento.' : 'Could not update follow.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Direct DM — instructors publicly solicit business, so no connection is
          required. Opens /messages?user=, which creates the conversation via the
          get_or_create_direct_conversation RPC. Mirrors StorefrontProfileColumn. */}
      <Link
        href={`/messages?user=${instructorId}`}
        className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl font-semibold text-sm bg-tribe-green text-slate-900 hover:opacity-90 transition-all"
      >
        <MessageCircle className="w-4 h-4" aria-hidden="true" />
        {language === 'es' ? 'Enviar mensaje' : 'Message'}
      </Link>

      {/* Follow — the mechanism for an athlete to track an instructor. Outline
          when not following so it reads as secondary to the primary Message CTA. */}
      <button
        type="button"
        onClick={handleFollowToggle}
        disabled={busy}
        className={`w-full px-3 py-3 rounded-xl font-semibold transition-all text-sm disabled:opacity-60 ${
          following
            ? 'bg-tribe-green/20 text-tribe-green border border-tribe-green'
            : 'border border-tribe-green text-tribe-green hover:bg-tribe-green hover:text-slate-900'
        }`}
      >
        {following ? (language === 'es' ? 'Siguiendo' : 'Following') : language === 'es' ? 'Seguir' : 'Follow'}
      </button>

      <p className="px-1 text-xs text-theme-tertiary">
        {language === 'es'
          ? 'Síguelo para ver sus publicaciones en tu feed.'
          : 'Follow to see their posts in your feed.'}
      </p>
    </div>
  );
}
