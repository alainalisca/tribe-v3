'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import BottomNav from '@/components/BottomNav';
import InstructorPostCard from '@/components/feed/InstructorPostCard';
import { fetchFeedPosts, type PostWithAuthor } from '@/lib/dal/instructorPosts';

const PAGE_SIZE = 10;

export default function FeedV2Page() {
  const { language } = useLanguage();
  const supabase = createClient();
  const [posts, setPosts] = useState<PostWithAuthor[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setViewerId(user?.id ?? null);
      const res = await fetchFeedPosts(supabase, {
        limit: PAGE_SIZE,
        offset: 0,
        viewerId: user?.id,
      });
      if (cancelled) return;
      if (res.success && res.data) {
        setPosts(res.data.posts);
        setTotal(res.data.total);
        setOffset(res.data.posts.length);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    const res = await fetchFeedPosts(supabase, {
      limit: PAGE_SIZE,
      offset,
      viewerId: viewerId ?? undefined,
    });
    if (res.success && res.data) {
      setPosts((prev) => [...prev, ...res.data!.posts]);
      setOffset(offset + res.data.posts.length);
    }
    setLoadingMore(false);
  };

  const t = {
    title: language === 'es' ? 'Noticias' : 'Feed',
    empty:
      language === 'es'
        ? 'Sigue instructores para ver sus actualizaciones aquí'
        : 'Follow instructors to see their updates here',
    browse: language === 'es' ? 'Explorar instructores' : 'Browse instructors',
    loadMore: language === 'es' ? 'Cargar más' : 'Load more',
    loading: language === 'es' ? 'Cargando…' : 'Loading…',
  };

  return (
    <div className="min-h-screen pb-24 bg-white dark:bg-[#272D34] text-stone-900 dark:text-white">
      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
        <h1 className="text-2xl font-extrabold">{t.title}</h1>

        {loading ? (
          <p className="py-12 text-center text-sm text-gray-400">{t.loading}</p>
        ) : posts.length === 0 ? (
          <div className="py-10 text-center space-y-3">
            <p className="text-sm text-gray-400">{t.empty}</p>
            <Link
              href="/instructors"
              className="inline-block px-4 py-2 rounded-lg bg-[#84cc16] text-slate-900 text-sm font-bold"
            >
              {t.browse}
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {posts.map((post) => (
                <InstructorPostCard key={post.id} post={post} viewerId={viewerId} language={language as 'en' | 'es'} />
              ))}
            </div>
            {posts.length < total && (
              <div className="text-center pt-2">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-4 py-2 rounded-lg bg-[#3D4349] text-sm text-gray-200 disabled:opacity-50"
                >
                  {loadingMore ? t.loading : t.loadMore}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
