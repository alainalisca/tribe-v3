/** Page: /communities/[id]/post/[postId]/comments — comments on a community post */
'use client';

/**
 * Every community post has carried a comments link since the feed shipped,
 * and the route it pointed at did not exist, so the link 404'd for every
 * user on a surface the bottom nav reaches. The data layer was already
 * complete: community_post_comments and community_post_likes have RLS
 * (migrations 011, 013, 048) and their counters are maintained by the
 * triggers in migration 099. Only the page was missing.
 *
 * The like control lives here rather than on the feed because the feed
 * rendered it as a <button> with no handler. One working control beats two
 * places to keep in sync, and the count on the feed still reads from the
 * same trigger-maintained column.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { ChevronLeft, Heart, Loader2, MessageCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { logError } from '@/lib/logger';
import { showError } from '@/lib/toast';
import { haptic } from '@/lib/haptics';
import { useLanguage } from '@/lib/LanguageContext';
import { bogotaDateTimeLabel } from '@/lib/time/bogotaDate';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import BottomNav from '@/components/BottomNav';
import {
  fetchCommunityPostById,
  fetchCommunityPostComments,
  hasLikedCommunityPost,
  insertCommunityPostComment,
  likeCommunityPost,
  unlikeCommunityPost,
  type CommunityPostCommentWithAuthor,
  type CommunityPostWithAuthor,
} from '@/lib/dal/communities';

const MAX_CHARS = 500;

export default function CommunityPostCommentsPage() {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();
  const t = useTranslations('communityComments');
  const { language } = useLanguage();

  const communityId = params.id as string;
  const postId = params.postId as string;

  const [userId, setUserId] = useState<string | null>(null);
  const [post, setPost] = useState<CommunityPostWithAuthor | null>(null);
  const [comments, setComments] = useState<CommunityPostCommentWithAuthor[]>([]);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [likePending, setLikePending] = useState(false);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);

    const [postRes, commentsRes] = await Promise.all([
      fetchCommunityPostById(supabase, postId),
      fetchCommunityPostComments(supabase, postId),
    ]);

    if (!postRes.success || !postRes.data) {
      showError(t('loadError'));
      setLoading(false);
      return;
    }

    setPost(postRes.data);
    setLikeCount(postRes.data.likes_count ?? 0);
    setComments(commentsRes.success ? (commentsRes.data ?? []) : []);

    if (user) {
      const likeRes = await hasLikedCommunityPost(supabase, postId, user.id);
      if (likeRes.success) setLiked(!!likeRes.data);
    }

    setLoading(false);
    // supabase and t are stable for the life of the page; postId is the only
    // real dependency, and re-running on the others would refetch on every
    // language read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleLike() {
    if (!userId || likePending) return;
    setLikePending(true);

    // Optimistic: the counter column is maintained by a DB trigger, so the
    // only thing to undo on failure is this local pair.
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    await haptic('light');

    const res = next
      ? await likeCommunityPost(supabase, postId, userId)
      : await unlikeCommunityPost(supabase, postId, userId);

    if (!res.success) {
      setLiked(!next);
      setLikeCount((c) => c + (next ? -1 : 1));
      showError(t('likeError'));
    }
    setLikePending(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;

    const body = content.trim();
    if (!body) {
      showError(t('required'));
      return;
    }

    setSending(true);
    const res = await insertCommunityPostComment(supabase, {
      post_id: postId,
      author_id: userId,
      content: body,
    });

    if (!res.success) {
      logError(res.error, { action: 'insertCommunityPostComment', postId });
      await haptic('error');
      showError(res.error || t('postError'));
      setSending(false);
      return;
    }

    setContent('');
    await haptic('success');
    const refreshed = await fetchCommunityPostComments(supabase, postId);
    if (refreshed.success) setComments(refreshed.data ?? []);
    setSending(false);
  }

  const charsLeft = MAX_CHARS - content.length;
  const overLimit = charsLeft < 0;

  return (
    <div className="min-h-screen bg-white dark:bg-tribe-surface">
      <div className="sticky top-0 safe-area-top bg-white dark:bg-tribe-surface border-b border-gray-200 dark:border-tribe-mid z-40">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => router.push(`/communities/${communityId}`)}
            className="p-2 hover:bg-stone-100 dark:hover:bg-tribe-mid rounded-lg transition"
            aria-label={t('backAria')}
          >
            <ChevronLeft className="w-6 h-6 text-theme-primary" />
          </button>
          <h1 className="text-2xl font-bold text-theme-primary">{t('title')}</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 pb-32">
        {loading ? (
          <p className="py-12 text-center text-sm text-theme-tertiary">{t('loading')}</p>
        ) : !post ? (
          <p className="py-12 text-center text-sm text-theme-tertiary">{t('loadError')}</p>
        ) : (
          <>
            {/* The post being commented on */}
            <article className="pb-5 border-b border-gray-200 dark:border-tribe-mid">
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={post.author?.avatar_url || ''} alt={post.author?.name || ''} />
                  <AvatarFallback>{post.author?.name?.[0] || 'U'}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-theme-primary">{post.author?.name}</p>
                  <p className="text-xs text-theme-tertiary">{bogotaDateTimeLabel(post.created_at, language)}</p>
                </div>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-theme-primary">{post.content}</p>

              {post.media_url && (
                <Image
                  src={post.media_url}
                  alt=""
                  width={600}
                  height={384}
                  className="mt-3 w-full rounded-lg max-h-96 object-cover"
                  unoptimized
                />
              )}

              <div className="flex gap-4 items-center pt-3 mt-3 text-sm border-t border-gray-200 dark:border-tribe-card">
                <button
                  onClick={toggleLike}
                  disabled={!userId || likePending}
                  aria-label={liked ? t('unlikeAria') : t('likeAria')}
                  aria-pressed={liked}
                  className={`flex items-center gap-1 transition disabled:opacity-50 ${
                    liked ? 'text-red-500' : 'text-stone-600 dark:text-gray-400 hover:text-red-500'
                  }`}
                >
                  <Heart className="w-4 h-4" fill={liked ? 'currentColor' : 'none'} />
                  {likeCount}
                </button>
                <span className="flex items-center gap-1 text-stone-600 dark:text-gray-400">
                  <MessageCircle className="w-4 h-4" />
                  {comments.length}
                </span>
              </div>
            </article>

            {/* Comments */}
            {comments.length === 0 ? (
              <p className="py-10 text-center text-sm text-theme-tertiary">{t('empty')}</p>
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-tribe-mid">
                {comments.map((c) => (
                  <li key={c.id} className="flex gap-3 py-4">
                    <Avatar className="w-9 h-9 shrink-0">
                      <AvatarImage src={c.author?.avatar_url || ''} alt={c.author?.name || ''} />
                      <AvatarFallback>{c.author?.name?.[0] || 'U'}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-theme-primary">
                        {c.author?.name}
                        <span className="ml-2 text-xs font-normal text-theme-tertiary">
                          {bogotaDateTimeLabel(c.created_at, language)}
                        </span>
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-theme-primary">{c.content}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* Composer */}
      {!loading && post && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 dark:border-tribe-mid bg-white dark:bg-tribe-surface">
          <div className="max-w-2xl mx-auto px-4 py-3" style={{ paddingBottom: 'calc(var(--bottom-nav-h) + 0.75rem)' }}>
            {userId ? (
              <form onSubmit={handleSubmit} className="flex items-end gap-2">
                <div className="flex-1">
                  <label htmlFor="community-comment" className="sr-only">
                    {t('placeholder')}
                  </label>
                  <textarea
                    id="community-comment"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={t('placeholder')}
                    rows={1}
                    className="w-full resize-none rounded-xl border border-gray-200 dark:border-tribe-mid bg-stone-50 dark:bg-tribe-mid px-3 py-2 text-sm text-theme-primary focus:outline-none focus:ring-2 focus:ring-tribe-green"
                  />
                  {content.length > MAX_CHARS - 100 && (
                    <p className={`mt-1 text-xs ${overLimit ? 'text-red-500' : 'text-theme-tertiary'}`}>
                      {t('charsLeft', { n: charsLeft })}
                    </p>
                  )}
                </div>
                <Button type="submit" disabled={sending || overLimit || !content.trim()} className="shrink-0">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('send')}
                </Button>
              </form>
            ) : (
              <p className="py-2 text-center text-sm text-theme-tertiary">{t('signedOut')}</p>
            )}
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
