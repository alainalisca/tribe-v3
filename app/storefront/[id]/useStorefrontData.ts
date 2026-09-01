/**
 * Storefront data layer. Extracted verbatim from the original
 * app/storefront/[id]/page.tsx so the Part 6 redesign restructures only
 * JSX/layout, never data fetching. Sole addition: `productCount` (a
 * head-count query) which the new tab system uses to hide empty tabs.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchPartnerByUserId, fetchPartnerInstructors } from '@/lib/dal/featuredPartners';
import { followUser, unfollowUser, followNotificationMessage } from '@/lib/dal/promote';
import type { FeaturedPartner, PartnerInstructor } from '@/lib/dal/featuredPartners';
import { togglePostLike } from '@/lib/dal/instructorPosts';
import { SESSION_ALL_COLUMNS } from '@/lib/dal/sessions';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';
import { showError, showSuccess } from '@/lib/toast';

export interface Instructor {
  id: string;
  name: string;
  avatar_url: string;
  tagline: string;
  location: string;
  specialties: string[];
  verified: boolean;
  storefront_banner_url: string;
  bio: string;
  instructor_bio?: string | null;
  average_rating?: number | null;
  total_reviews?: number | null;
  storefront_video_url?: string | null;
  certifications?: string[] | null;
  years_experience?: number | null;
  total_participants_served?: number | null;
  total_sessions_hosted?: number | null;
  photos?: string[] | null;
}

export interface Session {
  id: string;
  title: string;
  sport: string;
  date: string;
  start_time: string;
  // Real counter columns (current_participants maintained by the 087 trigger).
  // The card computes spots left from these; it previously read phantom
  // spots_available/time/price fields that are not DB columns.
  max_participants: number;
  current_participants: number | null;
  creator_id: string;
  is_boosted?: boolean;
  currency?: string;
  is_paid?: boolean;
  price_cents?: number;
  location?: string;
  join_policy?: string;
  // Recurring-series fields. is_recurring/recurring_parent_id identify a series
  // member; recurrence_pattern/recurrence_days carry the RESOLVED cadence; for a
  // child occurrence these are copied from its parent below (a child never stores
  // its own pattern), for a true parent they are the parent's own. All are real
  // selected columns or values resolved from a real column, never phantom fields.
  is_recurring: boolean | null;
  recurring_parent_id: string | null;
  recurrence_pattern: string | null;
  recurrence_days: string | null;
}

export interface ServicePackage {
  id: string;
  name: string;
  description: string;
  price: number;
  session_count?: number;
  duration?: string;
  instructor_id: string;
  is_active: boolean;
  tag?: string;
  currency?: string;
  price_cents?: number;
}

export interface StorefrontMedia {
  id: string;
  url: string;
  media_type: 'image' | 'video';
  instructor_id: string;
}

export interface InstructorPost {
  id: string;
  content: string;
  media_url?: string;
  media_type?: 'image' | 'video';
  likes_count: number;
  views_count: number;
  created_at: string;
  author_id: string;
}

export interface FollowState {
  isFollowing: boolean;
  followerCount: number;
  followingCount: number;
}

export function useStorefrontData(instructorId: string) {
  const supabase = createClient();
  const { language } = useLanguage();

  const [instructor, setInstructor] = useState<Instructor | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [media, setMedia] = useState<StorefrontMedia[]>([]);
  const [posts, setPosts] = useState<InstructorPost[]>([]);
  const [productCount, setProductCount] = useState<number | null>(null);
  const [followState, setFollowState] = useState<FollowState>({
    isFollowing: false,
    followerCount: 0,
    followingCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [joinedSessionIds, setJoinedSessionIds] = useState<Set<string>>(new Set());
  const [partnerData, setPartnerData] = useState<FeaturedPartner | null>(null);
  const [partnerInstructors, setPartnerInstructors] = useState<PartnerInstructor[]>([]);

  useEffect(() => {
    const fetchCurrentUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    fetchCurrentUser();
  }, [supabase]);

  const refreshJoinedSessions = useCallback(async () => {
    if (!currentUserId || sessions.length === 0) return;
    const sessionIds = sessions.map((s) => s.id);
    const { data } = await supabase
      .from('session_participants')
      .select('session_id')
      .eq('user_id', currentUserId)
      .in('session_id', sessionIds)
      .in('status', ['confirmed', 'pending']);
    if (data) setJoinedSessionIds(new Set(data.map((d: { session_id: string }) => d.session_id)));
  }, [currentUserId, sessions, supabase]);

  useEffect(() => {
    refreshJoinedSessions();
  }, [refreshJoinedSessions]);

  const handleSessionJoined = useCallback((sessionId: string) => {
    setJoinedSessionIds((prev) => new Set([...prev, sessionId]));
  }, []);

  // Instructor profile + partner data. Both are independent reads keyed on
  // instructorId so they fire in parallel. Partner-instructors is a follow-up
  // only when a partner row exists.
  useEffect(() => {
    if (!instructorId) return;
    let cancelled = false;
    (async () => {
      try {
        const [instructorResult, partnerResult] = await Promise.all([
          supabase
            .from('users')
            .select(
              'id, name, avatar_url, storefront_tagline, location, specialties, is_verified_instructor, storefront_banner_url, bio, instructor_bio, average_rating, total_reviews, storefront_video_url, certifications, years_experience, total_participants_served, total_sessions_hosted, photos'
            )
            .eq('id', instructorId)
            // A soft-deleted account's storefront should not load — maybeSingle
            // returns null (instructor stays null → not-found UI) instead of a
            // ghost profile for an account the admin removed.
            .is('deleted_at', null)
            .maybeSingle(),
          fetchPartnerByUserId(supabase, instructorId),
        ]);

        if (cancelled) return;

        if (instructorResult.error) throw instructorResult.error;
        const instructorData = instructorResult.data;
        // No row → instructor doesn't exist or was soft-deleted. Leave
        // instructor null so the page renders its not-found state.
        if (!instructorData) {
          setInstructor(null);
          setLoading(false);
          return;
        }
        setInstructor({
          ...instructorData,
          tagline: instructorData.storefront_tagline,
          verified: instructorData.is_verified_instructor,
        } as unknown as Instructor);

        if (partnerResult.success && partnerResult.data && partnerResult.data.status === 'active') {
          setPartnerData(partnerResult.data);
          const iResult = await fetchPartnerInstructors(supabase, partnerResult.data.id);
          if (!cancelled && iResult.success && iResult.data) setPartnerInstructors(iResult.data);
        }
      } catch (err) {
        logError(err, { action: 'useStorefrontData.fetchInstructor', instructorId });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [instructorId, supabase]);

  // Storefront data (sessions/boosts/packages/media/posts/product count/
  // follower counts). All six independent reads now fire in one Promise.all
  // batch instead of six sequential awaits. Network time goes from sum to
  // max — typically a 5-7x speedup on a slow connection.
  useEffect(() => {
    if (!instructorId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);

        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const [
          sessionsResult,
          boostsResult,
          packagesResult,
          mediaResult,
          postsResult,
          productsResult,
          followersResult,
          followingResult,
        ] = await Promise.all([
          supabase
            .from('sessions')
            // Explicit column list, not select('*'): the storefront session cards
            // read raw DB columns off the spread row (the local Session interface
            // is a loose cast), so SESSION_ALL_COLUMNS keeps full coverage while
            // removing the select('*') latent-401 risk.
            .select(SESSION_ALL_COLUMNS)
            .eq('creator_id', instructorId)
            // Sessions are written with status 'active' on every create path, the
            // DB default is 'active', and RLS only exposes 'active'. 'open' is a
            // join_policy value, not a status, so this filter matched nothing and
            // the storefront Sessions tab was always empty (which also hid the tab
            // and disabled the Book CTA). Filter on the real value.
            .eq('status', 'active')
            .gte('date', todayStr)
            .order('date', { ascending: true }),
          // Audit S-5: schema columns are `boosted_session_id` (not `session_id`)
          // and `status` (not boolean `is_active`). Both name mismatches caused
          // PostgREST to reject the SELECT, so the storefront never showed
          // boost badges on any session — defeating the point of paying for a
          // boost on your own storefront.
          supabase
            .from('boost_campaigns')
            .select('boosted_session_id')
            .eq('instructor_id', instructorId)
            .eq('status', 'active'),
          supabase.from('service_packages').select('*').eq('instructor_id', instructorId).eq('is_active', true),
          supabase
            .from('storefront_media')
            .select('*')
            .eq('instructor_id', instructorId)
            .order('created_at', { ascending: false }),
          supabase
            .from('instructor_posts')
            .select('*')
            .eq('author_id', instructorId)
            .order('created_at', { ascending: false }),
          // Product count drives empty-tab hiding (spec 6C). Fail-open: on a
          // count error leave productCount null so the page shows the tab
          // rather than wrongly hiding real products.
          supabase
            .from('products')
            .select('id', { count: 'exact', head: true })
            .eq('instructor_id', instructorId)
            .eq('status', 'active'),
          // T3-7: count-only (head:true) instead of transferring every follower
          // row just to read .length — an instructor with thousands of followers
          // was shipping thousands of UUIDs on every storefront open.
          supabase
            .from('user_follows')
            .select('follower_id', { count: 'exact', head: true })
            .eq('following_id', instructorId),
          supabase
            .from('user_follows')
            .select('following_id', { count: 'exact', head: true })
            .eq('follower_id', instructorId),
        ]);

        if (cancelled) return;

        if (sessionsResult.data) {
          const boostedSessionIds = new Set(
            boostsResult.data?.map((b: { boosted_session_id: string }) => b.boosted_session_id) || []
          );

          // Resolve the recurring cadence per row. A child occurrence stores only
          // recurring_parent_id (createChildSession never copies the pattern), so
          // batch-fetch the distinct parents' cadence in ONE query and map it onto
          // their children; a true parent row already carries its own pattern.
          // Active parents are anon-readable (RLS: status='active'), so this works
          // on the guest storefront too. Explicit columns, single query, no N+1.
          const rawRows = sessionsResult.data as Array<Record<string, unknown>>;
          const parentIds = Array.from(
            new Set(rawRows.map((r) => r.recurring_parent_id as string | null).filter((id): id is string => !!id))
          );
          const parentCadence = new Map<string, { pattern: string | null; days: string | null }>();
          if (parentIds.length > 0) {
            const { data: parents } = await supabase
              .from('sessions')
              .select('id, recurrence_pattern, recurrence_days')
              .in('id', parentIds);
            for (const p of (parents ?? []) as Array<{
              id: string;
              recurrence_pattern: string | null;
              recurrence_days: string | null;
            }>) {
              parentCadence.set(p.id, { pattern: p.recurrence_pattern, days: p.recurrence_days });
            }
          }
          if (cancelled) return;

          // `as unknown as Session[]`: an explicit column-list string select loses
          // PostgREST row-type inference (columns come back untyped), so the mapped
          // rows are cast to the local Session shape. Every Session field is a real
          // selected column or one of the values resolved just below, so no phantom
          // display fields.
          setSessions(
            rawRows.map((r) => {
              const parentId = (r.recurring_parent_id as string | null) ?? null;
              const parent = parentId ? parentCadence.get(parentId) : null;
              // Child uses its parent's cadence; parent uses its own; one-off gets null.
              return {
                ...r,
                is_boosted: boostedSessionIds.has(r.id as string),
                is_recurring: (r.is_recurring as boolean | null) ?? null,
                recurring_parent_id: parentId,
                recurrence_pattern: parent ? parent.pattern : ((r.recurrence_pattern as string | null) ?? null),
                recurrence_days: parent ? parent.days : ((r.recurrence_days as string | null) ?? null),
              };
            }) as unknown as Session[]
          );
        }
        if (packagesResult.data) setPackages(packagesResult.data);
        if (mediaResult.data) setMedia(mediaResult.data);
        if (postsResult.data) setPosts(postsResult.data);
        setProductCount(productsResult.error ? null : (productsResult.count ?? 0));

        // Follow-count refresh only. `isFollowing` is owned by the viewer
        // follow-state effect below; clobbering it to false here was a race —
        // a re-fetch (e.g. on a language change) reset the button to "Follow"
        // for an already-followed instructor, and the next click hit the
        // (follower_id, following_id) unique constraint and failed. Preserve it.
        setFollowState((prev) => ({
          ...prev,
          followerCount: followersResult.count || 0,
          followingCount: followingResult.count || 0,
        }));

        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        logError(err, { action: 'useStorefrontData.fetchStorefrontData', instructorId });
        showError(
          language === 'es'
            ? 'No se pudo cargar la tienda. Intenta de nuevo.'
            : 'Could not load the storefront. Please try again.'
        );
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [instructorId, supabase, language]);

  // Resolve the *actual* follow state for the signed-in viewer. Runs
  // whenever the current user resolves (decoupled from the follower
  // count fetch, which races user resolution). Previously isFollowing
  // was hardcoded false so the button never reflected reality.
  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('user_follows')
        .select('follower_id')
        .eq('follower_id', currentUserId)
        .eq('following_id', instructorId)
        .maybeSingle();
      if (cancelled || error) return;
      setFollowState((prev) => ({ ...prev, isFollowing: !!data }));
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, instructorId, supabase]);

  const handleFollowToggle = async () => {
    if (!currentUserId) {
      showError(language === 'es' ? 'Inicia sesión para seguir.' : 'Sign in to follow.');
      return;
    }
    const wasFollowing = followState.isFollowing;
    setFollowState((prev) => ({
      ...prev,
      isFollowing: !wasFollowing,
      followerCount: Math.max(0, prev.followerCount + (wasFollowing ? -1 : 1)),
    }));
    try {
      if (wasFollowing) {
        // BUG-215: route through DAL so a 0-row (RLS-blocked) delete surfaces
        // as a failure instead of a silent success that reverts on reload.
        const result = await unfollowUser(supabase, currentUserId, instructorId);
        if (!result.success) throw new Error(result.error ?? 'Unfollow failed');
        // BUG-006: the button label flipped but with no follower-count
        // display anywhere in the storefront, the user got no visible
        // confirmation. A toast makes the success obvious.
        showSuccess(language === 'es' ? 'Dejaste de seguir' : 'Unfollowed');
      } else {
        // BUG-215: route through DAL so a 0-row (RLS-blocked) insert surfaces
        // as a failure instead of a silent success that reverts on reload.
        // Notify the instructor that this athlete followed them.
        const { data: authData } = await supabase.auth.getUser();
        const followerName =
          authData.user?.user_metadata?.name || authData.user?.email || (language === 'es' ? 'Alguien' : 'Someone');
        const result = await followUser(
          supabase,
          currentUserId,
          instructorId,
          followNotificationMessage(followerName, language)
        );
        if (!result.success) throw new Error(result.error ?? 'Follow failed');
        showSuccess(language === 'es' ? 'Ahora sigues' : 'Following');
      }
    } catch (err) {
      // Roll back the optimistic update.
      setFollowState((prev) => ({
        ...prev,
        isFollowing: wasFollowing,
        followerCount: Math.max(0, prev.followerCount + (wasFollowing ? 1 : -1)),
      }));
      logError(err, { action: 'useStorefrontData.handleFollowToggle', instructorId });
      showError(language === 'es' ? 'No se pudo actualizar el seguimiento.' : 'Could not update follow.');
    }
  };

  const handlePostLike = async (postId: string) => {
    if (!currentUserId) {
      showError(language === 'es' ? 'Inicia sesión para reaccionar.' : 'Sign in to like.');
      return;
    }
    const wasLiked = likedPosts.has(postId);
    const bump = (delta: number) =>
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, likes_count: Math.max(0, p.likes_count + delta) } : p))
      );
    const setLiked = (liked: boolean) =>
      setLikedPosts((prev) => {
        const next = new Set(prev);
        if (liked) next.add(postId);
        else next.delete(postId);
        return next;
      });

    // Optimistic.
    setLiked(!wasLiked);
    bump(wasLiked ? -1 : 1);

    const res = await togglePostLike(supabase, postId, currentUserId);
    if (!res.success) {
      setLiked(wasLiked);
      bump(wasLiked ? 1 : -1);
      logError(res.error, { action: 'useStorefrontData.handlePostLike', postId });
      showError(language === 'es' ? 'No se pudo reaccionar a la publicación.' : 'Could not like the post.');
      return;
    }
    // Reconcile with the server's authoritative values.
    setLiked(res.data!.liked);
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, likes_count: res.data!.likeCount } : p)));
  };

  // #5/#4: the storefront only ever rendered `storefront_media`, never the
  // instructor's profile gallery (`users.photos`) — so an instructor who
  // uploaded photos to their profile still showed only a cover + avatar here.
  // Surface those photos in the Media tab (deduped against any storefront_media
  // row with the same URL so nothing double-renders).
  const combinedMedia = useMemo<StorefrontMedia[]>(() => {
    const galleryPhotos: StorefrontMedia[] = (instructor?.photos ?? [])
      .filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
      .map((url, i) => ({ id: `photo-${i}`, url, media_type: 'image', instructor_id: instructorId }));
    const seen = new Set(galleryPhotos.map((m) => m.url));
    return [...galleryPhotos, ...media.filter((m) => !seen.has(m.url))];
  }, [instructor, media, instructorId]);

  return {
    instructor,
    sessions,
    packages,
    media: combinedMedia,
    posts,
    productCount,
    followState,
    loading,
    likedPosts,
    currentUserId,
    joinedSessionIds,
    partnerData,
    partnerInstructors,
    handleSessionJoined,
    handleFollowToggle,
    handlePostLike,
  };
}
