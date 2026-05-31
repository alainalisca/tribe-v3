/**
 * Storefront data layer. Extracted verbatim from the original
 * app/storefront/[id]/page.tsx so the Part 6 redesign restructures only
 * JSX/layout, never data fetching. Sole addition: `productCount` (a
 * head-count query) which the new tab system uses to hide empty tabs.
 */
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchPartnerByUserId, fetchPartnerInstructors } from '@/lib/dal/featuredPartners';
import type { FeaturedPartner, PartnerInstructor } from '@/lib/dal/featuredPartners';
import { togglePostLike } from '@/lib/dal/instructorPosts';
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
  average_rating?: number | null;
  total_reviews?: number | null;
  storefront_video_url?: string | null;
  certifications?: string[] | null;
  years_experience?: number | null;
  total_participants_served?: number | null;
  total_sessions_hosted?: number | null;
}

export interface Session {
  id: string;
  title: string;
  sport: string;
  date: string;
  time: string;
  price: number;
  spots_available: number;
  spots_total: number;
  creator_id: string;
  is_boosted?: boolean;
  currency?: string;
  is_paid?: boolean;
  price_cents?: number;
  location?: string;
  join_policy?: string;
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
              'id, name, avatar_url, storefront_tagline, location, specialties, is_verified_instructor, storefront_banner_url, bio, average_rating, total_reviews, storefront_video_url, certifications, years_experience, total_participants_served, total_sessions_hosted'
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
            .select('*')
            .eq('creator_id', instructorId)
            .eq('status', 'open')
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
          supabase.from('user_follows').select('follower_id').eq('following_id', instructorId),
          supabase.from('user_follows').select('following_id').eq('follower_id', instructorId),
        ]);

        if (cancelled) return;

        if (sessionsResult.data) {
          const boostedSessionIds = new Set(
            boostsResult.data?.map((b: { boosted_session_id: string }) => b.boosted_session_id) || []
          );
          setSessions(sessionsResult.data.map((s: Session) => ({ ...s, is_boosted: boostedSessionIds.has(s.id) })));
        }
        if (packagesResult.data) setPackages(packagesResult.data);
        if (mediaResult.data) setMedia(mediaResult.data);
        if (postsResult.data) setPosts(postsResult.data);
        setProductCount(productsResult.error ? null : (productsResult.count ?? 0));

        setFollowState({
          isFollowing: false,
          followerCount: followersResult.data?.length || 0,
          followingCount: followingResult.data?.length || 0,
        });

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
        const { error } = await supabase
          .from('user_follows')
          .delete()
          .eq('follower_id', currentUserId)
          .eq('following_id', instructorId);
        if (error) throw error;
        // BUG-006: the button label flipped but with no follower-count
        // display anywhere in the storefront, the user got no visible
        // confirmation. A toast makes the success obvious.
        showSuccess(language === 'es' ? 'Dejaste de seguir' : 'Unfollowed');
      } else {
        const { error } = await supabase
          .from('user_follows')
          .insert({ follower_id: currentUserId, following_id: instructorId });
        if (error) throw error;
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

  return {
    instructor,
    sessions,
    packages,
    media,
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
