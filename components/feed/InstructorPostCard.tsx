'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, MessageCircle, Share2, Pin, ShieldCheck, Play } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  togglePostLike,
  addPostComment,
  fetchPostComments,
  type PostWithAuthor,
  type CommentWithUser,
} from '@/lib/dal/instructorPosts';
import { showError } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { trackEvent } from '@/lib/analytics';
import { sportTranslations } from '@/lib/translations';

interface InstructorPostCardProps {
  post: PostWithAuthor;
  viewerId: string | null;
  language: 'en' | 'es';
}

function formatRelative(iso: string, language: 'en' | 'es'): string {
  const diffMin = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (language === 'es') {
    if (diffMin < 60) return `hace ${Math.max(1, diffMin)} min`;
    if (diffHr < 24) return `hace ${diffHr} h`;
    return `hace ${diffDay} d`;
  }
  if (diffMin < 60) return `${Math.max(1, diffMin)}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${diffDay}d ago`;
}

function postTypeLabel(type: PostWithAuthor['post_type'], language: 'en' | 'es'): string | null {
  const es: Record<typeof type, string> = {
    text: '',
    photo: '',
    video: 'VIDEO',
    tip: 'CONSEJO',
    workout: 'ENTRENAMIENTO',
    session_preview: 'PRÓXIMA SESIÓN',
  };
  const en: Record<typeof type, string> = {
    text: '',
    photo: '',
    video: 'VIDEO',
    tip: 'TIP',
    workout: 'WORKOUT',
    session_preview: 'UPCOMING SESSION',
  };
  return (language === 'es' ? es[type] : en[type]) || null;
}

function postTypeIcon(type: PostWithAuthor['post_type']): string {
  switch (type) {
    case 'tip':
      return '💡';
    case 'workout':
      return '🏋️';
    case 'session_preview':
      return '📅';
    case 'video':
      return '🎬';
    default:
      return '';
  }
}

export default function InstructorPostCard({ post, viewerId, language }: InstructorPostCardProps) {
  const supabase = createClient();
  const [liked, setLiked] = useState(!!post.user_has_liked);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<CommentWithUser[]>([]);
  const [commentText, setCommentText] = useState('');
  const [busy, setBusy] = useState(false);

  const body = language === 'es' && post.body_es ? post.body_es : post.body;
  const title = language === 'es' ? post.title_es || post.title : post.title;
  const typeLabel = postTypeLabel(post.post_type, language);
  const typeIcon = postTypeIcon(post.post_type);

  const handleLike = async () => {
    if (!viewerId) return;
    // Optimistic update
    setLiked((v) => !v);
    setLikeCount((c) => c + (liked ? -1 : 1));
    await haptic('light');
    const res = await togglePostLike(supabase, post.id, viewerId);
    if (!res.success || !res.data) {
      // Rollback
      setLiked(!liked);
      setLikeCount(post.like_count);
      showError(res.error || 'Failed');
      return;
    }
    setLiked(res.data.liked);
    setLikeCount(res.data.likeCount);
    if (res.data.liked) trackEvent('post_liked', { post_id: post.id });
  };

  const openComments = async () => {
    setCommentsOpen(true);
    if (comments.length === 0 && commentCount > 0) {
      const res = await fetchPostComments(supabase, post.id, 20, 0);
      if (res.success && res.data) setComments(res.data);
    }
  };

  const handleComment = async () => {
    if (!viewerId || !commentText.trim()) return;
    setBusy(true);
    const res = await addPostComment(supabase, post.id, viewerId, commentText);
    if (res.success) {
      setCommentText('');
      const refresh = await fetchPostComments(supabase, post.id, 20, 0);
      if (refresh.success && refresh.data) {
        setComments(refresh.data);
        setCommentCount(refresh.data.length);
      }
      trackEvent('post_commented', { post_id: post.id });
    } else {
      showError(res.error || 'Failed');
    }
    setBusy(false);
  };

  const handleShare = async () => {
    const url =
      typeof window !== 'undefined' ? `${window.location.origin}/feed#${post.id}` : `https://tribe.app/feed#${post.id}`;
    const nav: Navigator & {
      share?: (d: { title?: string; text?: string; url?: string }) => Promise<void>;
    } = typeof navigator !== 'undefined' ? (navigator as Navigator) : ({} as Navigator);
    try {
      if (typeof nav.share === 'function') {
        await nav.share({ title: title || 'Tribe', text: body.slice(0, 100), url });
      } else if (nav.clipboard && typeof nav.clipboard.writeText === 'function') {
        await nav.clipboard.writeText(url);
      }
    } catch {
      // cancelled
    }
  };

  return (
    <article id={post.id} className="bg-[#3D4349] rounded-2xl p-4 border border-[#404549]">
      {/* Author */}
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#272D34] overflow-hidden relative flex-shrink-0">
          {post.author?.avatar_url ? (
            <Image src={post.author.avatar_url} alt={post.author.name} fill sizes="40px" className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">
              {(post.author?.name || '?').charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <Link
            href={`/storefront/${post.author?.id}`}
            className="flex items-center gap-1 font-semibold text-sm text-white hover:text-[#A3E635]"
          >
            {post.author?.name}
            {post.author?.is_verified_instructor && <ShieldCheck className="w-3.5 h-3.5 text-[#84cc16]" />}
          </Link>
          <p className="text-xs text-gray-500">{formatRelative(post.created_at, language)}</p>
        </div>
        {post.is_pinned && <Pin className="w-4 h-4 text-[#A3E635]" />}
      </header>

      {typeLabel && (
        <p className="mt-3 text-xs font-bold tracking-wide text-[#A3E635]">
          {typeIcon} {typeLabel}
        </p>
      )}

      {title && <h3 className="mt-1 text-base font-bold text-white">{title}</h3>}

      {body && <p className="mt-2 text-sm text-gray-200 whitespace-pre-wrap">{body}</p>}

      {/* Media */}
      {post.media_urls && post.media_urls.length > 0 && (
        <div className="mt-3 relative rounded-xl overflow-hidden aspect-video bg-black">
          {post.post_type === 'video' ? (
            <video
              controls
              playsInline
              poster={post.thumbnail_url || undefined}
              src={post.media_urls[0]}
              className="w-full h-full"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.media_urls[0]} alt="" className="w-full h-full object-cover" />
          )}
          {post.post_type === 'video' && !post.media_urls[0].endsWith('.mp4') && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <Play className="w-12 h-12 text-white/80" />
            </div>
          )}
        </div>
      )}

      {/* Linked session preview */}
      {post.linked_session && (
        <Link
          href={`/session/${post.linked_session.id}`}
          className="mt-3 block bg-[#272D34] rounded-xl p-3 border border-[#404549] hover:border-[#84cc16]"
        >
          <p className="text-xs text-gray-400">{post.linked_session.date}</p>
          <p className="text-sm font-semibold text-white mt-0.5">
            {post.linked_session.title ||
              (post.linked_session.sport
                ? language === 'es'
                  ? sportTranslations[post.linked_session.sport]?.es || post.linked_session.sport
                  : sportTranslations[post.linked_session.sport]?.en || post.linked_session.sport
                : '')}
          </p>
          <span className="inline-block mt-2 text-xs font-bold text-[#A3E635]">
            {language === 'es' ? 'Reservar →' : 'Book Now →'}
          </span>
        </Link>
      )}

      {/* Interactions */}
      <footer className="mt-4 flex items-center gap-4 text-xs text-gray-400 pt-3 border-t border-[#272D34]">
        <button
          type="button"
          onClick={handleLike}
          disabled={!viewerId}
          className={`flex items-center gap-1 hover:text-[#A3E635] ${liked ? 'text-[#84cc16]' : ''}`}
        >
          <Heart className={`w-4 h-4 ${liked ? 'fill-[#84cc16] text-[#84cc16]' : ''}`} />
          <span>{likeCount}</span>
        </button>
        <button type="button" onClick={openComments} className="flex items-center gap-1 hover:text-[#A3E635]">
          <MessageCircle className="w-4 h-4" />
          <span>{commentCount}</span>
        </button>
        <button type="button" onClick={handleShare} className="ml-auto flex items-center gap-1 hover:text-[#A3E635]">
          <Share2 className="w-4 h-4" />
          <span>{language === 'es' ? 'Compartir' : 'Share'}</span>
        </button>
      </footer>

      {commentsOpen && (
        <div className="mt-3 space-y-3">
          <ul className="space-y-2">
            {comments.map((c) => (
              <li key={c.id} className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-[#272D34] overflow-hidden relative flex-shrink-0">
                  {c.user?.avatar_url ? (
                    <Image src={c.user.avatar_url} alt={c.user.name} fill sizes="24px" className="object-cover" />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs">
                    <span className="font-semibold text-white">{c.user?.name || ''}</span>{' '}
                    <span className="text-gray-300">{c.body}</span>
                  </p>
                  <p className="text-[10px] text-gray-500">{formatRelative(c.created_at, language)}</p>
                </div>
              </li>
            ))}
          </ul>
          {viewerId && (
            <div className="flex gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={language === 'es' ? 'Agregar un comentario…' : 'Add a comment…'}
                className="flex-1 px-3 py-1.5 rounded-lg bg-[#272D34] text-white text-xs"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleComment();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleComment}
                disabled={busy || !commentText.trim()}
                className="px-3 py-1.5 rounded-lg bg-[#84cc16] text-slate-900 text-xs font-bold disabled:opacity-50"
              >
                {language === 'es' ? 'Enviar' : 'Post'}
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
