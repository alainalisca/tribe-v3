'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Heart, MessageCircle } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';

interface InstructorPost {
  id: string;
  content: string;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
  likes_count: number;
  comments_count: number;
  author: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
  linked_session_id: string | null;
}

export default function FeedPostPreview() {
  const { language } = useLanguage();
  const [post, setPost] = useState<InstructorPost | null>(null);

  useEffect(() => {
    loadLatestPost();
  }, []);

  async function loadLatestPost() {
    const supabase = createClient();
    const { data } = await supabase
      .from('posts')
      .select(
        `
        id, content, media_url, media_type, created_at, likes_count, comments_count,
        linked_session_id,
        author:users!posts_user_id_fkey(id, name, avatar_url)
      `
      )
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const raw = data as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- Supabase join typing
      setPost({
        ...raw,
        author: Array.isArray(raw.author) ? raw.author[0] : raw.author,
      });
    }
  }

  if (!post) return null;

  const timeAgo = getTimeAgo(post.created_at, language);

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
          <img src={post.media_url} alt="" className="w-full h-48 object-cover" loading="lazy" />
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
          <span className="ml-auto text-tribe-green text-xs font-medium">
            {language === 'es' ? 'Ver en Feed' : 'View in Feed'} →
          </span>
        </div>
      </div>
    </Link>
  );
}

function getTimeAgo(dateStr: string, language: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return language === 'es' ? `hace ${mins}m` : `${mins}m ago`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return language === 'es' ? `hace ${hours}h` : `${hours}h ago`;
  }
  const days = Math.floor(seconds / 86400);
  return language === 'es' ? `hace ${days}d` : `${days}d ago`;
}
