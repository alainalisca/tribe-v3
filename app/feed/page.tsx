'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import {
  Heart,
  Eye,
  Share2,
  Play,
  MapPin,
  Calendar,
  DollarSign,
  CheckCircle,
  Loader,
  MessageSquare,
  MessageCircle,
} from 'lucide-react';
import Image from 'next/image';
import BottomNav from '@/components/BottomNav';
import PostCommentSection from '@/components/PostCommentSection';
import { formatPrice } from '@/lib/formatCurrency';
import type { Currency } from '@/lib/payments/config';

interface InstructorPost {
  id: string;
  author_id: string;
  content: string;
  media_url?: string | null;
  media_type?: string | null;
  linked_session_id?: string | null;
  created_at: string;
  updated_at: string;
  comments_count?: number;
  author: {
    id: string;
    name: string;
    avatar_url?: string | null;
    is_verified_instructor: boolean;
  };
}

interface SessionDetails {
  id: string;
  sport: string;
  date: string;
  price_cents: number;
  currency: string | null;
  location: string;
  instructor_id: string;
  title: string;
}

interface PostLike {
  id: string;
  post_id: string;
  user_id: string;
}

const POSTS_PER_PAGE = 20;

export default function FeedPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const supabase = createClient();

  const [posts, setPosts] = useState<InstructorPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isInstructor, setIsInstructor] = useState(false);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [sessionDetails, setSessionDetails] = useState<Record<string, SessionDetails>>({});
  const [shareMessage, setShareMessage] = useState('');
  const [postViews, setPostViews] = useState<Record<string, number>>({});
  const [expandedCommentPost, setExpandedCommentPost] = useState<string | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  const t = {
    en: {
      yourFeed: 'Your Feed',
      compose: 'Compose',
      followInstructors: 'Follow instructors to see their posts here',
      loadMore: 'Load More',
      loading: 'Loading...',
      viewsAgo: (time: string) => `${time} ago`,
      noMore: 'No more posts',
      copyLink: 'Link copied!',
      errorLoading: 'Error loading feed',
      instructorSession: 'Class Details',
      viewSession: 'View Class',
      people: 'people',
    },
    es: {
      yourFeed: 'Tu Feed',
      compose: 'Crear',
      followInstructors: 'Sigue instructores para ver sus publicaciones aquí',
      loadMore: 'Cargar más',
      loading: 'Cargando...',
      viewsAgo: (time: string) => `hace ${time}`,
      noMore: 'No hay más publicaciones',
      copyLink: 'Enlace copiado!',
      errorLoading: 'Error cargando el feed',
      instructorSession: 'Detalles de la clase',
      viewSession: 'Ver clase',
      people: 'personas',
    },
  };

  const strings = t[language as keyof typeof t] || t.en;

  useEffect(() => {
    const getCurrentUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/auth/login');
        return;
      }

      setCurrentUserId(user.id);

      // Check if user is instructor
      const { data: userData } = await supabase.from('users').select('is_instructor').eq('id', user.id).single();

      setIsInstructor(userData?.is_instructor || false);
    };

    getCurrentUser();
  }, [supabase, router]);

  useEffect(() => {
    if (!currentUserId) return;

    const loadFeed = async () => {
      setLoading(true);

      try {
        // Get users this person follows
        const { data: follows, error: followsError } = await supabase
          .from('user_follows')
          .select('following_id')
          .eq('follower_id', currentUserId);

        if (followsError) throw followsError;

        const followingIds = follows?.map((f: { following_id: string }) => f.following_id) || [];

        if (followingIds.length === 0) {
          setPosts([]);
          setHasMore(false);
          setLoading(false);
          return;
        }

        // Get posts from followed users
        const { data: rawPosts, error: postsError } = await supabase
          .from('instructor_posts')
          .select(
            `
            id,
            author_id,
            content,
            media_url,
            media_type,
            linked_session_id,
            created_at,
            updated_at,
            comments_count,
            author:users(
              id,
              name,
              avatar_url,
              is_verified_instructor
            )
          `
          )
          .in('author_id', followingIds)
          .order('created_at', { ascending: false })
          .range(offset, offset + POSTS_PER_PAGE - 1);

        if (postsError) throw postsError;

        // Map Supabase join arrays to single objects
        const postsData: InstructorPost[] = (rawPosts || []).map((p: Record<string, unknown>) => ({
          ...p,
          author: Array.isArray(p.author) ? p.author[0] : p.author,
        })) as InstructorPost[];

        // Get post stats
        if (postsData && postsData.length > 0) {
          const postIds = postsData.map((p) => p.id);

          // Get likes count
          const { data: likesData } = await supabase.from('post_likes').select('post_id').in('post_id', postIds);

          const likeCounts: Record<string, number> = {};
          likesData?.forEach((like: { post_id: string }) => {
            likeCounts[like.post_id] = (likeCounts[like.post_id] || 0) + 1;
          });

          setPostViews(likeCounts);

          // Check user's likes
          const { data: userLikes } = await supabase
            .from('post_likes')
            .select('post_id')
            .in('post_id', postIds)
            .eq('user_id', currentUserId);

          const liked = new Set<string>(userLikes?.map((l: { post_id: string }) => l.post_id) || []);
          setLikedPosts(liked);

          // Fetch session details if needed
          const sessionIds = postsData.filter((p) => p.linked_session_id).map((p) => p.linked_session_id) as string[];

          if (sessionIds.length > 0) {
            const { data: sessions } = await supabase
              .from('sessions')
              .select('id, sport, date, price_cents, currency, location, instructor_id, title')
              .in('id', sessionIds);

            if (sessions) {
              const sessionMap: Record<string, SessionDetails> = {};
              sessions.forEach((s) => {
                const sd = s as unknown as SessionDetails;
                sessionMap[sd.id] = sd;
              });
              setSessionDetails(sessionMap);
            }
          }

          setPosts((prevPosts) => (offset === 0 ? postsData : [...prevPosts, ...postsData]));
          setHasMore(postsData.length === POSTS_PER_PAGE);
        } else {
          setHasMore(false);
        }
      } catch (error) {
        console.error('Error loading feed:', error);
      } finally {
        setLoading(false);
      }
    };

    loadFeed();
  }, [currentUserId, offset, supabase]);

  const toggleLike = async (postId: string) => {
    if (!currentUserId) return;

    const isLiked = likedPosts.has(postId);

    // Optimistic update
    const newLikedPosts = new Set(likedPosts);
    if (isLiked) {
      newLikedPosts.delete(postId);
    } else {
      newLikedPosts.add(postId);
    }
    setLikedPosts(newLikedPosts);

    try {
      if (isLiked) {
        await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', currentUserId);
      } else {
        await supabase.from('post_likes').insert({
          post_id: postId,
          user_id: currentUserId,
          created_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      // Revert optimistic update
      setLikedPosts(likedPosts);
    }
  };

  const recordView = async (_postId: string) => {
    // View tracking placeholder — post_views table not yet created
  };

  const sharePost = async (postId: string) => {
    const url = `${window.location.origin}/feed/${postId}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareMessage(postId);
      setTimeout(() => setShareMessage(''), 2000);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
    }
  };

  const handleLoadMore = () => {
    setOffset((prev) => prev + POSTS_PER_PAGE);
  };

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center justify-between px-4">
          <h1 className="text-lg font-bold text-theme-primary">{strings.yourFeed}</h1>
          {isInstructor && (
            <button
              onClick={() => router.push('/promote/posts')}
              className="bg-tribe-green text-slate-900 font-semibold rounded-lg px-4 py-2 hover:bg-tribe-green transition"
            >
              {strings.compose}
            </button>
          )}
        </div>
      </div>

      {/* Feed Content */}
      <div className="pt-header max-w-2xl mx-auto p-4 space-y-4">
        {loading && offset === 0 ? (
          <div className="bg-white dark:bg-tribe-dark rounded-2xl p-5 border border-stone-200 dark:border-gray-700 flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-4">
              <Loader className="h-8 w-8 animate-spin text-tribe-green" />
              <p className="text-theme-secondary">{strings.loading}</p>
            </div>
          </div>
        ) : posts.length === 0 ? (
          <div className="bg-white dark:bg-tribe-dark rounded-2xl p-5 border border-stone-200 dark:border-gray-700 flex flex-col items-center justify-center gap-4 py-12">
            <MessageSquare className="h-12 w-12 text-theme-secondary" />
            <p className="text-center text-theme-secondary">{strings.followInstructors}</p>
            <button
              onClick={() => router.push('/instructors')}
              className="mt-2 bg-tribe-green text-slate-900 font-semibold rounded-xl px-6 py-2 hover:bg-tribe-green transition"
            >
              {language === 'es' ? 'Seguir instructores' : 'Follow Instructors'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <div key={post.id}>
                <PostCard
                  post={post}
                  isLiked={likedPosts.has(post.id)}
                  onToggleLike={() => toggleLike(post.id)}
                  onShare={() => sharePost(post.id)}
                  onView={() => recordView(post.id)}
                  onToggleComments={() => setExpandedCommentPost(expandedCommentPost === post.id ? null : post.id)}
                  session={post.linked_session_id ? sessionDetails[post.linked_session_id] : undefined}
                  viewCount={postViews[post.id] || 0}
                  shareMessage={shareMessage === post.id}
                  commentCount={post.comments_count || 0}
                  language={language}
                />
                {expandedCommentPost === post.id && currentUserId && (
                  <div className="bg-white dark:bg-tribe-dark rounded-b-2xl p-5 border border-t-0 border-stone-200 dark:border-gray-700">
                    <PostCommentSection
                      postId={post.id}
                      currentUserId={currentUserId}
                      postAuthorId={post.author_id}
                      language={language}
                      isExpanded={true}
                    />
                  </div>
                )}
              </div>
            ))}

            {/* Load More Button */}
            {hasMore && (
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="w-full bg-stone-100 dark:bg-tribe-surface text-stone-700 dark:text-gray-300 rounded-xl py-3 font-semibold transition hover:bg-stone-200 dark:hover:bg-[#4A515A] disabled:opacity-50"
              >
                {loading ? strings.loading : strings.loadMore}
              </button>
            )}

            {!hasMore && posts.length > 0 && <p className="py-4 text-center text-theme-secondary">{strings.noMore}</p>}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}

export function formatTimeAgo(dateString: string, language: string) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return language === 'es' ? `hace ${seconds}s` : `${seconds}s ago`;
  if (seconds < 3600)
    return language === 'es' ? `hace ${Math.floor(seconds / 60)}m` : `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400)
    return language === 'es' ? `hace ${Math.floor(seconds / 3600)}h` : `${Math.floor(seconds / 3600)}h ago`;
  return language === 'es' ? `hace ${Math.floor(seconds / 86400)}d` : `${Math.floor(seconds / 86400)}d ago`;
}

interface PostCardProps {
  post: InstructorPost;
  isLiked: boolean;
  onToggleLike: () => void;
  onShare: () => void;
  onView: () => void;
  onToggleComments: () => void;
  session?: SessionDetails;
  viewCount: number;
  shareMessage: boolean;
  commentCount: number;
  language: string;
}

function PostCard({
  post,
  isLiked,
  onToggleLike,
  onShare,
  onView,
  onToggleComments,
  session,
  viewCount,
  shareMessage,
  commentCount,
  language,
}: PostCardProps) {
  const [showFullContent, setShowFullContent] = useState(false);

  useEffect(() => {
    onView();
  }, [onView]);

  const isLongContent = post.content.length > 280;

  const t = {
    en: {
      viewClass: 'View Class',
      sport: 'Sport',
      price: 'Price',
      location: 'Location',
      date: 'Date',
      readMore: 'Read more',
      readLess: 'Read less',
    },
    es: {
      viewClass: 'Ver clase',
      sport: 'Deporte',
      price: 'Precio',
      location: 'Ubicación',
      date: 'Fecha',
      readMore: 'Leer más',
      readLess: 'Leer menos',
    },
  };

  const strings = t[language as keyof typeof t] || t.en;

  return (
    <div className="bg-white dark:bg-tribe-dark rounded-2xl p-5 border border-stone-200 dark:border-gray-700">
      {/* Author Info */}
      <div className="mb-4 flex items-center gap-3">
        {post.author.avatar_url && (
          <Image
            src={post.author.avatar_url}
            alt={post.author.name}
            width={48}
            height={48}
            className="h-12 w-12 rounded-full object-cover"
          />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-theme-primary">{post.author.name}</h3>
            {post.author.is_verified_instructor && <CheckCircle className="h-4 w-4 text-tribe-green" />}
          </div>
          <p className="text-xs text-theme-secondary">{formatTimeAgo(post.created_at, language)}</p>
        </div>
      </div>

      {/* Content */}
      <div className="mb-4">
        <p className="whitespace-pre-wrap text-theme-primary">
          {showFullContent || !isLongContent ? post.content : `${post.content.slice(0, 280)}...`}
        </p>
        {isLongContent && (
          <button
            onClick={() => setShowFullContent(!showFullContent)}
            className="mt-2 text-sm font-semibold text-tribe-green hover:bg-tribe-green/20 rounded px-2 py-1"
          >
            {showFullContent ? strings.readLess : strings.readMore}
          </button>
        )}
      </div>

      {/* Media */}
      {post.media_url && post.media_type === 'image' && (
        <div className="mb-4 flex items-center justify-center rounded-2xl overflow-hidden bg-stone-100 dark:bg-tribe-surface">
          <Image src={post.media_url!} alt="Post media" width={500} height={400} className="max-h-96 w-auto" />
        </div>
      )}

      {post.media_url && post.media_type === 'video' && (
        <div className="mb-4 flex items-center justify-center rounded-2xl overflow-hidden bg-stone-100 dark:bg-tribe-surface">
          <div className="relative w-full">
            <video src={post.media_url!} className="max-h-96 w-full" controls />
            <Play className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 text-tribe-green opacity-70" />
          </div>
        </div>
      )}

      {/* Session Preview */}
      {session && (
        <div className="mb-4 bg-stone-50 dark:bg-tribe-surface rounded-xl p-4 border border-stone-200 dark:border-[#52575D]">
          <h4 className="mb-3 font-semibold text-theme-primary">{strings.viewClass}</h4>
          <div className="space-y-2 text-sm text-theme-secondary">
            <div className="flex items-center gap-2">
              <span className="font-medium text-theme-primary">{session.sport}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-tribe-green" />
              <span>{new Date(session.date).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US')}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-tribe-green" />
              <span>{session.location}</span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-tribe-green" />
              <span>{formatPrice(session.price_cents, (session.currency || 'USD') as Currency)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-stone-200 dark:border-gray-700">
        <button onClick={onToggleLike} className="flex items-center gap-2 transition">
          <Heart className={`h-5 w-5 ${isLiked ? 'fill-red-500 text-red-500' : 'text-theme-secondary'}`} />
          <span className={`text-sm ${isLiked ? 'text-red-500' : 'text-theme-secondary'}`}>
            {/* Like count would go here if fetched */}
          </span>
        </button>

        <button
          onClick={onToggleComments}
          className="flex items-center gap-2 text-theme-secondary transition hover:text-tribe-green"
        >
          <MessageCircle className="h-5 w-5" />
          <span className="text-sm">{commentCount}</span>
        </button>

        <button className="flex items-center gap-2 text-theme-secondary transition hover:text-tribe-green">
          <Eye className="h-5 w-5" />
          <span className="text-sm">{viewCount}</span>
        </button>

        <button
          onClick={onShare}
          className="flex items-center gap-2 text-theme-secondary transition hover:text-tribe-green"
        >
          <Share2 className="h-5 w-5" />
          {shareMessage && (
            <span className="text-xs text-tribe-green">{language === 'es' ? '¡Copiado!' : 'Copied!'}</span>
          )}
        </button>
      </div>
    </div>
  );
}
