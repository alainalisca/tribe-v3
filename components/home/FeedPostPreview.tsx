'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Heart, MessageCircle } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { logError } from '@/lib/logger';
import { useTranslations } from '@/lib/i18n/useTranslations';

interface PostAuthor {
  id: string;
  name: string;
  avatar_url: string | null;
}

interface InstructorPost {
  id: string;
  content: string;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
  likes_count: number;
  comments_count: number;
  author: PostAuthor | null;
  linked_session_id: string | null;
}

/** Raw shape from the instructor_posts select before the author join is flattened. */
interface RawInstructorPost {
  id: string;
  content: string;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
  comments_count: number | null;
  linked_session_id: string | null;
  author: PostAuthor | PostAuthor[] | null;
}

export default function FeedPostPreview() {
  const t = useTranslations('home');
  const [post, setPost] = useState<InstructorPost | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    loadLatestPost();
  }, []);

  async function loadLatestPost() {
    const supabase = createClient();
    // instructor_posts is the live table (the previous `posts` table does not
    // exist -> a silent 404 that made this preview, the only nav path to /feed,
    // render nothing). Columns mirror the working /feed query; likes come from
    // post_likes (its source of truth) rather than the unmaintained like_count.
    const { data, error: postError } = await supabase
      .from('instructor_posts')
      .select(
        `
        id, content, media_url, media_type, created_at, comments_count, linked_session_id,
        author:users(id, name, avatar_url)
      `
      )
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (postError) {
      logError(postError, { action: 'FeedPostPreview.loadLatestPost' });
      setError(true);
      return;
    }
    if (!data) return;

    const raw = data as unknown as RawInstructorPost;
    const { count: likes } = await supabase
      .from('post_likes')
      .select('post_id', { count: 'exact', head: true })
      .eq('post_id', raw.id);

    setPost({
      id: raw.id,
      content: raw.content,
      media_url: raw.media_url,
      media_type: raw.media_type,
      created_at: raw.created_at,
      linked_session_id: raw.linked_session_id,
      comments_count: raw.comments_count ?? 0,
      likes_count: likes ?? 0,
      author: Array.isArray(raw.author) ? (raw.author[0] ?? null) : raw.author,
    });
  }

  // Error fallback: keep the /feed link alive so the only navigation path to the
  // feed survives even when the preview content fails to load.
  if (error) {
    return (
      <Link href="/feed" className="block">
        <div className="bg-white dark:bg-tribe-card rounded-xl border border-stone-200 dark:border-gray-600/30 px-4 py-3 flex items-center justify-between hover:shadow-sm transition-shadow">
          <span className="text-sm text-theme-secondary">{t('viewInFeed')}</span>
          <span className="text-tribe-green text-sm">→</span>
        </div>
      </Link>
    );
  }

  if (!post) return null;

  const timeAgo = getTimeAgo(post.created_at, t);

  return (
    <Link href="/feed" className="block">
      <div className="bg-white dark:bg-tribe-card rounded-xl border border-stone-200 dark:border-gray-600/30 overflow-hidden hover:shadow-sm transition-shadow">
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-2">
          <Avatar className="w-8 h-8">
            <AvatarImage src={post.author?.avatar_url || undefined} />
            <AvatarFallback className="bg-tribe-green text-slate-900 text-xs font-bold">
              {post.author?.name?.[0]?.toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-stone-900 dark:text-white truncate">{post.author?.name}</p>
            <p className="text-[11px] text-stone-400 dark:text-gray-500">{timeAgo}</p>
          </div>
        </div>

        {post.media_url && post.media_type?.startsWith('image') && (
          <img src={post.media_url} alt="Post image" className="w-full h-48 object-cover" loading="lazy" />
        )}

        <div className="px-4 py-2.5">
          <p className="text-sm text-stone-700 dark:text-gray-300 line-clamp-2">{post.content}</p>
        </div>

        <div className="flex items-center gap-4 px-4 pb-3 text-xs text-stone-400 dark:text-gray-500">
          <span className="flex items-center gap-1">
            <Heart className="w-3.5 h-3.5" /> {post.likes_count}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="w-3.5 h-3.5" /> {post.comments_count}
          </span>
          <span className="ml-auto text-tribe-green text-xs font-medium">{t('viewInFeed')} →</span>
        </div>
      </div>
    </Link>
  );
}

function getTimeAgo(dateStr: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return t('minsAgo', { n: mins });
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return t('hoursAgo', { n: hours });
  }
  const days = Math.floor(seconds / 86400);
  return t('daysAgo', { n: days });
}
