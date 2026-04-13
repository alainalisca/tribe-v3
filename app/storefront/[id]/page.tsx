'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import BottomNav from '@/components/BottomNav';
import StorefrontSessionCard from '@/components/storefront/StorefrontSessionCard';
import StorefrontPackageCard from '@/components/storefront/StorefrontPackageCard';
import Image from 'next/image';
import {
  Heart,
  MessageCircle,
  Share2,
  Play,
  Star,
  MapPin,
  Check,
  Users,
  TrendingUp,
  Clock,
  Zap,
  ChevronRight,
  Search,
  Eye,
  ArrowLeft,
} from 'lucide-react';
import { SkeletonProfile, SkeletonCard } from '@/components/Skeleton';
import { fetchPartnerByUserId, fetchPartnerInstructors } from '@/lib/dal/featuredPartners';
import type { FeaturedPartner, PartnerInstructor } from '@/lib/dal/featuredPartners';
import PartnerStorefrontBadge from '@/components/storefront/PartnerStorefrontBadge';
import PartnerInstructorRoster from '@/components/storefront/PartnerInstructorRoster';

// Type definitions
interface Instructor {
  id: string;
  name: string;
  avatar_url: string;
  tagline: string;
  location: string;
  specialties: string[];
  verified: boolean;
  storefront_banner_url: string;
  bio: string;
}

interface Session {
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

interface ServicePackage {
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

interface StorefrontMedia {
  id: string;
  url: string;
  media_type: 'image' | 'video';
  instructor_id: string;
}

interface InstructorPost {
  id: string;
  content: string;
  media_url?: string;
  media_type?: 'image' | 'video';
  likes_count: number;
  views_count: number;
  created_at: string;
  author_id: string;
}

interface FollowState {
  isFollowing: boolean;
  followerCount: number;
  followingCount: number;
}

export default function StorefrontPage() {
  const params = useParams();
  const { language } = useLanguage();
  const supabase = createClient();

  const instructorId = params.id as string;

  // State
  const [instructor, setInstructor] = useState<Instructor | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [media, setMedia] = useState<StorefrontMedia[]>([]);
  const [posts, setPosts] = useState<InstructorPost[]>([]);
  const [followState, setFollowState] = useState<FollowState>({
    isFollowing: false,
    followerCount: 0,
    followingCount: 0,
  });

  const [activeTab, setActiveTab] = useState('sessions');
  const [loading, setLoading] = useState(true);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [joinedSessionIds, setJoinedSessionIds] = useState<Set<string>>(new Set());
  const [partnerData, setPartnerData] = useState<FeaturedPartner | null>(null);
  const [partnerInstructors, setPartnerInstructors] = useState<PartnerInstructor[]>([]);

  // Translations
  const translations = {
    sessions: language === 'es' ? 'Sesiones' : 'Sessions',
    packages: language === 'es' ? 'Paquetes' : 'Packages',
    media: language === 'es' ? 'Medios' : 'Media',
    posts: language === 'es' ? 'Publicaciones' : 'Posts',
    follow: language === 'es' ? 'Seguir' : 'Follow',
    following: language === 'es' ? 'Siguiendo' : 'Following',
    followers: language === 'es' ? 'seguidores' : 'followers',
    following_label: language === 'es' ? 'siguiendo' : 'following',
    join: language === 'es' ? 'Unirse' : 'Join',
    payJoin: language === 'es' ? 'Pagar y Unirse' : 'Pay & Join',
    rating: language === 'es' ? 'Calificación' : 'Rating',
    totalSessions: language === 'es' ? 'Total Sesiones' : 'Total Sessions',
    returnRate: language === 'es' ? 'Tasa Retorno' : 'Return Rate',
    boosted: language === 'es' ? 'IMPULSADO' : 'BOOSTED',
    noSessions: language === 'es' ? 'No hay sesiones disponibles' : 'No sessions available',
    noPackages: language === 'es' ? 'Sin paquetes' : 'No packages',
    noMedia: language === 'es' ? 'Sin media' : 'No media',
    noPosts: language === 'es' ? 'Sin publicaciones' : 'No posts',
    verified: language === 'es' ? 'Verificado' : 'Verified',
    spotsLeft: language === 'es' ? 'Lugares' : 'Spots',
    viewsAgo: language === 'es' ? 'hace' : 'ago',
  };

  // Fetch current user + their joined sessions for this instructor's sessions
  useEffect(() => {
    const fetchCurrentUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    fetchCurrentUser();
  }, [supabase]);

  // Track which sessions the current user has joined
  const refreshJoinedSessions = useCallback(async () => {
    if (!currentUserId || sessions.length === 0) return;
    const sessionIds = sessions.map((s) => s.id);
    const { data } = await supabase
      .from('session_participants')
      .select('session_id')
      .eq('user_id', currentUserId)
      .in('session_id', sessionIds)
      .in('status', ['confirmed', 'pending']);
    if (data) {
      setJoinedSessionIds(new Set(data.map((d: { session_id: string }) => d.session_id)));
    }
  }, [currentUserId, sessions, supabase]);

  useEffect(() => {
    refreshJoinedSessions();
  }, [refreshJoinedSessions]);

  const handleSessionJoined = useCallback((sessionId: string) => {
    setJoinedSessionIds((prev) => new Set([...prev, sessionId]));
  }, []);

  // Fetch instructor details
  useEffect(() => {
    const fetchInstructor = async () => {
      try {
        const { data: instructorData, error } = await supabase
          .from('users')
          .select('id, name, avatar_url, storefront_tagline, location, specialties, is_verified_instructor, storefront_banner_url, bio')
          .eq('id', instructorId)
          .single();

        if (error) throw error;
        setInstructor({
          ...instructorData,
          tagline: instructorData.storefront_tagline,
          verified: instructorData.is_verified_instructor,
        } as unknown as Instructor);

        // Check if this instructor is a featured partner
        const pResult = await fetchPartnerByUserId(supabase, instructorId);
        if (pResult.success && pResult.data && pResult.data.status === 'active') {
          setPartnerData(pResult.data);
          const iResult = await fetchPartnerInstructors(supabase, pResult.data.id);
          if (iResult.success && iResult.data) {
            setPartnerInstructors(iResult.data);
          }
        }
      } catch (err) {
        console.error('Error fetching instructor:', err);
      }
    };

    if (instructorId) {
      fetchInstructor();
    }
  }, [instructorId, supabase]);

  // Fetch all storefront data
  useEffect(() => {
    const fetchStorefrontData = async () => {
      try {
        setLoading(true);

        // Fetch sessions — use date-only string for proper comparison with date column
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
          // Check for boosted campaigns
          const { data: boostData } = await supabase
            .from('boost_campaigns')
            .select('session_id')
            .eq('instructor_id', instructorId)
            .eq('is_active', true);

          const boostedSessionIds = new Set(boostData?.map((b: { session_id: string }) => b.session_id) || []);
          const enhancedSessions = sessionsData.map((s: Session) => ({
            ...s,
            is_boosted: boostedSessionIds.has(s.id),
          }));

          setSessions(enhancedSessions);
        }

        // Fetch packages
        const { data: packagesData } = await supabase
          .from('service_packages')
          .select('*')
          .eq('instructor_id', instructorId)
          .eq('is_active', true);

        if (packagesData) setPackages(packagesData);

        // Fetch media
        const { data: mediaData } = await supabase
          .from('storefront_media')
          .select('*')
          .eq('instructor_id', instructorId)
          .order('created_at', { ascending: false });

        if (mediaData) setMedia(mediaData);

        // Fetch posts
        const { data: postsData } = await supabase
          .from('instructor_posts')
          .select('*')
          .eq('author_id', instructorId)
          .order('created_at', { ascending: false });

        if (postsData) setPosts(postsData);

        // Fetch follow state
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

    if (instructorId) {
      fetchStorefrontData();
    }
  }, [instructorId, supabase]);

  // Handle follow/unfollow
  const handleFollowToggle = async () => {
    try {
      if (followState.isFollowing) {
        await supabase
          .from('user_follows')
          .delete()
          .eq('follower_id', 'current_user_id')
          .eq('following_id', instructorId);

        setFollowState((prev) => ({
          ...prev,
          isFollowing: false,
          followerCount: prev.followerCount - 1,
        }));
      } else {
        await supabase.from('user_follows').insert({
          follower_id: 'current_user_id',
          following_id: instructorId,
        });

        setFollowState((prev) => ({
          ...prev,
          isFollowing: true,
          followerCount: prev.followerCount + 1,
        }));
      }
    } catch (err) {
      console.error('Error toggling follow:', err);
    }
  };

  // Handle post like
  const handlePostLike = async (postId: string) => {
    try {
      if (likedPosts.has(postId)) {
        likedPosts.delete(postId);
        setLikedPosts(new Set(likedPosts));
      } else {
        likedPosts.add(postId);
        setLikedPosts(new Set(likedPosts));
      }
    } catch (err) {
      console.error('Error liking post:', err);
    }
  };

  // Format time ago
  const timeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return language === 'es' ? 'Ahora' : 'Now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${language === 'es' ? 'atrás' : 'ago'}`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${language === 'es' ? 'atrás' : 'ago'}`;
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ${language === 'es' ? 'atrás' : 'ago'}`;

    return `${Math.floor(seconds / 2592000)}mo ${language === 'es' ? 'atrás' : 'ago'}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-dark">
        <div className="max-w-2xl mx-auto p-4 pt-20 space-y-4">
          <SkeletonProfile />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!instructor) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid pb-32">
        <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-white dark:bg-tribe-dark border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-2xl mx-auto h-14 flex items-center gap-3 px-4">
            <button
              onClick={() => window.history.back()}
              className="p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white hover:opacity-70" />
            </button>
            <h1 className="text-lg font-bold text-stone-900 dark:text-white leading-tight">
              {language === 'es' ? 'Perfil del Instructor' : 'Instructor Profile'}
            </h1>
          </div>
        </div>
        <div className="pt-header flex items-center justify-center min-h-[60vh]">
          <div className="text-center p-6">
            <div className="text-4xl mb-4">🏋️</div>
            <p className="text-lg font-semibold text-stone-900 dark:text-white mb-2">
              {language === 'es' ? 'Instructor no encontrado' : 'Instructor not found'}
            </p>
            <p className="text-sm text-stone-500 dark:text-gray-400 mb-6">
              {language === 'es'
                ? 'Este perfil no existe o no está disponible.'
                : "This profile doesn't exist or is not available."}
            </p>
            <button
              onClick={() => window.history.back()}
              className="inline-block px-6 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition"
            >
              {language === 'es' ? 'Volver' : 'Go Back'}
            </button>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <button className="text-theme-primary hover:text-tribe-green transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h2 className="flex-1 text-center text-theme-primary font-semibold">{instructor.name}</h2>
          <div className="w-6"></div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="relative h-56 bg-gradient-to-br from-tribe-green to-lime-500 overflow-hidden pt-14">
        {instructor.storefront_banner_url ? (
          <Image src={instructor.storefront_banner_url} alt="Instructor storefront banner" fill className="object-cover opacity-60" unoptimized />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-tribe-green to-lime-500"></div>
        )}

        {/* Instructor Info Card */}
        <div className="absolute -bottom-20 left-4 right-4 mx-auto max-w-2xl">
          <div className="flex gap-4 items-start bg-white dark:bg-tribe-dark rounded-2xl p-4 border border-stone-200 dark:border-gray-700">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <Image
                src={instructor.avatar_url || 'https://via.placeholder.com/80'}
                alt={instructor.name}
                width={80}
                height={80}
                className="w-20 h-20 rounded-full border-2 border-tribe-green object-cover"
                unoptimized
              />
              {instructor.verified && (
                <div className="absolute bottom-0 right-0 bg-tribe-green rounded-full p-1">
                  <Check className="w-4 h-4 text-slate-900" />
                </div>
              )}
            </div>

            {/* Info and Follow Button */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between mb-1">
                <div className="flex-1">
                  <h1 className="text-xl font-bold text-theme-primary">{instructor.name}</h1>
                  {instructor.verified && (
                    <p className="text-tribe-green text-xs font-semibold">✓ {translations.verified}</p>
                  )}
                </div>
              </div>

              <p className="text-theme-secondary text-xs mb-2 line-clamp-1">
                {instructor.tagline || 'Certified Instructor'}
              </p>

              <div className="flex items-center gap-1 text-xs text-theme-secondary mb-2">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{instructor.location || 'Location not specified'}</span>
              </div>

              {/* Specialties */}
              {instructor.specialties && instructor.specialties.length > 0 && (
                <div className="flex gap-1 mb-2 flex-wrap">
                  {instructor.specialties.slice(0, 2).map((specialty, idx) => (
                    <span
                      key={idx}
                      className="bg-tribe-green/20 text-tribe-green px-2 py-0.5 rounded-full text-xs font-semibold"
                    >
                      {specialty}
                    </span>
                  ))}
                </div>
              )}

              {/* Follow Button */}
              <button
                onClick={handleFollowToggle}
                className={`w-full px-3 py-1.5 rounded-lg font-semibold transition-all text-xs ${
                  followState.isFollowing
                    ? 'bg-tribe-green/20 text-tribe-green border border-tribe-green'
                    : 'bg-tribe-green text-slate-900 hover:bg-tribe-green'
                }`}
              >
                {followState.isFollowing ? translations.following : translations.follow}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="pt-header max-w-2xl mx-auto px-4 mt-24 grid grid-cols-4 gap-2">
        <div className="bg-white dark:bg-tribe-dark rounded-2xl p-3 border border-stone-200 dark:border-gray-700 text-center">
          <div className="flex items-center justify-center gap-0.5 mb-0.5">
            <Star className="w-4 h-4 text-tribe-green" />
            <span className="text-lg font-bold text-theme-primary">4.8</span>
          </div>
          <p className="text-xs text-theme-secondary">{translations.rating}</p>
        </div>

        <div className="bg-white dark:bg-tribe-dark rounded-2xl p-3 border border-stone-200 dark:border-gray-700 text-center">
          <p className="text-lg font-bold text-tribe-green">{sessions.length}</p>
          <p className="text-xs text-theme-secondary">{translations.totalSessions}</p>
        </div>

        <div className="bg-white dark:bg-tribe-dark rounded-2xl p-3 border border-stone-200 dark:border-gray-700 text-center">
          <p className="text-lg font-bold text-tribe-green">{followState.followerCount}</p>
          <p className="text-xs text-theme-secondary">{translations.followers}</p>
        </div>

        <div className="bg-white dark:bg-tribe-dark rounded-2xl p-3 border border-stone-200 dark:border-gray-700 text-center">
          <p className="text-lg font-bold text-tribe-green">92%</p>
          <p className="text-xs text-theme-secondary">{translations.returnRate}</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-header max-w-2xl mx-auto p-4 space-y-4">
        {/* Featured Partner Badge */}
        {partnerData && <PartnerStorefrontBadge partner={partnerData} language={language} />}

        {/* Bio Section */}
        {instructor.bio && (
          <div className="bg-white dark:bg-tribe-dark rounded-2xl p-4 border border-stone-200 dark:border-gray-700">
            <p className="text-theme-secondary text-sm leading-relaxed">{instructor.bio}</p>
          </div>
        )}

        {/* Partner Instructor Roster */}
        {partnerData && partnerInstructors.length > 0 && (
          <PartnerInstructorRoster instructors={partnerInstructors} language={language} />
        )}

        {/* Tab Navigation */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[
            { id: 'sessions', label: translations.sessions },
            { id: 'packages', label: translations.packages },
            { id: 'media', label: translations.media },
            { id: 'posts', label: translations.posts },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 font-semibold transition-colors whitespace-nowrap rounded-xl text-sm ${
                activeTab === tab.id
                  ? 'bg-tribe-green text-slate-900'
                  : 'bg-stone-100 dark:bg-tribe-surface text-stone-700 dark:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}

        {/* Sessions Tab */}
        {activeTab === 'sessions' && (
          <div>
            {sessions.length > 0 ? (
              <div className="space-y-3">
                {sessions.map((session) => (
                  <StorefrontSessionCard
                    key={session.id}
                    session={session}
                    language={language as 'en' | 'es'}
                    currentUserId={currentUserId}
                    joinedSessionIds={joinedSessionIds}
                    onJoined={handleSessionJoined}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-theme-secondary text-sm">{translations.noSessions}</p>
              </div>
            )}
          </div>
        )}

        {/* Packages Tab */}
        {activeTab === 'packages' && (
          <div>
            {packages.length > 0 ? (
              <div className="space-y-3">
                {packages.map((pkg) => (
                  <StorefrontPackageCard
                    key={pkg.id}
                    pkg={pkg}
                    language={language as 'en' | 'es'}
                    instructorId={instructorId}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-theme-secondary text-sm">{translations.noPackages}</p>
              </div>
            )}
          </div>
        )}

        {/* Media Tab */}
        {activeTab === 'media' && (
          <div>
            {media.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {media.map((item) => (
                  <div
                    key={item.id}
                    className="relative aspect-square rounded-2xl overflow-hidden bg-stone-200 dark:bg-tribe-surface group cursor-pointer border border-stone-200 dark:border-gray-700"
                  >
                    <Image
                      src={item.url}
                      alt="Storefront media content"
                      fill
                      className="object-cover group-hover:scale-105 transition-transform"
                      unoptimized
                    />

                    {/* Video Play Icon */}
                    {item.media_type === 'video' && (
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/50 transition-all">
                        <Play className="w-8 h-8 text-white fill-white" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-theme-secondary text-sm">{translations.noMedia}</p>
              </div>
            )}
          </div>
        )}

        {/* Posts Tab */}
        {activeTab === 'posts' && (
          <div>
            {posts.length > 0 ? (
              <div className="space-y-4">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    className="bg-white dark:bg-tribe-dark rounded-2xl border border-stone-200 dark:border-gray-700 p-4"
                  >
                    {/* Post Content */}
                    <p className="text-theme-primary mb-3 text-sm leading-relaxed">{post.content}</p>

                    {/* Post Media */}
                    {post.media_url && (
                      <div className="relative aspect-video rounded-xl overflow-hidden mb-3 bg-stone-200 dark:bg-tribe-surface group border border-stone-200 dark:border-gray-700">
                        <Image
                          src={post.media_url}
                          alt="Instructor post media"
                          fill
                          className="object-cover group-hover:scale-105 transition-transform"
                          unoptimized
                        />
                        {post.media_type === 'video' && (
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/50 transition-all">
                            <Play className="w-10 h-10 text-white fill-white" />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Post Footer */}
                    <div className="flex items-center justify-between text-xs text-theme-secondary pt-3 border-t border-stone-200 dark:border-gray-700">
                      <div className="flex gap-3">
                        <button
                          onClick={() => handlePostLike(post.id)}
                          className="flex items-center gap-1 hover:text-tribe-green transition-colors"
                        >
                          <Heart className={`w-4 h-4 ${likedPosts.has(post.id) ? 'fill-red-500 text-red-500' : ''}`} />
                          <span>{post.likes_count}</span>
                        </button>
                        <div className="flex items-center gap-1">
                          <Eye className="w-4 h-4" />
                          <span>{post.views_count}</span>
                        </div>
                      </div>
                      <span className="text-xs text-theme-secondary">{timeAgo(post.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-theme-secondary text-sm">{translations.noPosts}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
