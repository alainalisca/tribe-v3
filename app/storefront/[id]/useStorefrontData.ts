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

  useEffect(() => {
    const fetchInstructor = async () => {
      try {
        const { data: instructorData, error } = await supabase
          .from('users')
          .select(
            'id, name, avatar_url, storefront_tagline, location, specialties, is_verified_instructor, storefront_banner_url, bio, average_rating, total_reviews, storefront_video_url, certifications, years_experience, total_participants_served, total_sessions_hosted'
          )
          .eq('id', instructorId)
          .single();

        if (error) throw error;
        setInstructor({
          ...instructorData,
          tagline: instructorData.storefront_tagline,
          verified: instructorData.is_verified_instructor,
        } as unknown as Instructor);

        const pResult = await fetchPartnerByUserId(supabase, instructorId);
        if (pResult.success && pResult.data && pResult.data.status === 'active') {
          setPartnerData(pResult.data);
          const iResult = await fetchPartnerInstructors(supabase, pResult.data.id);
          if (iResult.success && iResult.data) setPartnerInstructors(iResult.data);
        }
      } catch (err) {
        console.error('Error fetching instructor:', err);
      }
    };
    if (instructorId) fetchInstructor();
  }, [instructorId, supabase]);

  useEffect(() => {
    const fetchStorefrontData = async () => {
      try {
        setLoading(true);

        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const { data: sessionsData } = await supabase
          .from('sessions')
          .select('*')
          .eq('creator_id', instructorId)
          .eq('status', 'open')
          .gte('date', todayStr)
          .order('date', { ascending: true });

        if (sessionsData) {
          const { data: boostData } = await supabase
            .from('boost_campaigns')
            .select('session_id')
            .eq('instructor_id', instructorId)
            .eq('is_active', true);

          const boostedSessionIds = new Set(boostData?.map((b: { session_id: string }) => b.session_id) || []);
          setSessions(sessionsData.map((s: Session) => ({ ...s, is_boosted: boostedSessionIds.has(s.id) })));
        }

        const { data: packagesData } = await supabase
          .from('service_packages')
          .select('*')
          .eq('instructor_id', instructorId)
          .eq('is_active', true);
        if (packagesData) setPackages(packagesData);

        const { data: mediaData } = await supabase
          .from('storefront_media')
          .select('*')
          .eq('instructor_id', instructorId)
          .order('created_at', { ascending: false });
        if (mediaData) setMedia(mediaData);

        const { data: postsData } = await supabase
          .from('instructor_posts')
          .select('*')
          .eq('author_id', instructorId)
          .order('created_at', { ascending: false });
        if (postsData) setPosts(postsData);

        // Product count drives empty-tab hiding (spec 6C). Fail-open:
        // on a count error leave productCount null so the page shows
        // the tab rather than wrongly hiding real products.
        const { count: prodCount, error: prodErr } = await supabase
          .from('products')
          .select('id', { count: 'exact', head: true })
          .eq('instructor_id', instructorId)
          .eq('status', 'active');
        setProductCount(prodErr ? null : (prodCount ?? 0));

        const { data: followerData } = await supabase
          .from('user_follows')
          .select('follower_id')
          .eq('following_id', instructorId);
        const { data: followingData } = await supabase
          .from('user_follows')
          .select('following_id')
          .eq('follower_id', instructorId);

        setFollowState({
          isFollowing: false,
          followerCount: followerData?.length || 0,
          followingCount: followingData?.length || 0,
        });

        setLoading(false);
      } catch (err) {
        console.error('Error fetching storefront data:', err);
        setLoading(false);
      }
    };
    if (instructorId) fetchStorefrontData();
  }, [instructorId, supabase]);

  const handleFollowToggle = async () => {
    try {
      if (followState.isFollowing) {
        await supabase
          .from('user_follows')
          .delete()
          .eq('follower_id', 'current_user_id')
          .eq('following_id', instructorId);
        setFollowState((prev) => ({ ...prev, isFollowing: false, followerCount: prev.followerCount - 1 }));
      } else {
        await supabase.from('user_follows').insert({ follower_id: 'current_user_id', following_id: instructorId });
        setFollowState((prev) => ({ ...prev, isFollowing: true, followerCount: prev.followerCount + 1 }));
      }
    } catch (err) {
      console.error('Error toggling follow:', err);
    }
  };

  const handlePostLike = async (postId: string) => {
    try {
      const next = new Set(likedPosts);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      setLikedPosts(next);
    } catch (err) {
      console.error('Error liking post:', err);
    }
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
