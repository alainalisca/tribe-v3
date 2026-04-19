'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  fetchReviewsByHost,
  fetchReviewDistribution,
  type ReviewWithReviewer,
  type ReviewDistribution,
} from '@/lib/dal/reviews';
import { sportTranslations } from '@/lib/translations';

interface ReviewsListProps {
  hostId: string;
  /** Preview mode cap. Ignored when showAll = true. Defaults to 10. */
  limit?: number;
  /** When true, enables pagination and shows all reviews. When false, shows up to `limit` with a "See all" link. */
  showAll?: boolean;
  language: 'en' | 'es';
  /** Optional URL for the "See all reviews" link when showAll is false. */
  seeAllHref?: string;
}

const PAGE_SIZE = 10;

function formatRelativeTime(iso: string, language: 'en' | 'es'): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = Math.max(0, now - then);
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (language === 'es') {
    if (diffMin < 1) return 'justo ahora';
    if (diffMin < 60) return `hace ${diffMin} min`;
    if (diffHr < 24) return `hace ${diffHr} h`;
    if (diffDay < 7) return `hace ${diffDay} d`;
    if (diffWeek < 5) return `hace ${diffWeek} sem`;
    if (diffMonth < 12) return `hace ${diffMonth} mes`;
    return `hace ${diffYear} a`;
  }
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffWeek < 5) return `${diffWeek}w ago`;
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${diffYear}y ago`;
}

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={14}
          className={n <= rating ? 'fill-[#F59E0B] text-[#F59E0B]' : 'fill-transparent text-gray-600'}
        />
      ))}
    </div>
  );
}

function DistributionBar({ stars, count, total }: { stars: number; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-5 text-gray-400">{stars}★</span>
      <div className="flex-1 h-2 bg-[#272D34] rounded-full overflow-hidden">
        <div className="h-full bg-[#F59E0B] transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-gray-400">{count}</span>
    </div>
  );
}

export default function ReviewsList({ hostId, limit = 10, showAll = false, language, seeAllHref }: ReviewsListProps) {
  const [reviews, setReviews] = useState<ReviewWithReviewer[]>([]);
  const [distribution, setDistribution] = useState<ReviewDistribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const pageSize = showAll ? PAGE_SIZE : limit;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [listRes, distRes] = await Promise.all([
          fetchReviewsByHost(supabase, hostId, pageSize, 0),
          fetchReviewDistribution(supabase, hostId),
        ]);

        if (cancelled) return;

        if (!listRes.success) {
          setError(listRes.error || 'Failed to load reviews');
          setReviews([]);
        } else if (listRes.data) {
          setReviews(listRes.data.reviews);
          setTotal(listRes.data.total);
          setOffset(listRes.data.reviews.length);
        }

        if (distRes.success && distRes.data) {
          setDistribution(distRes.data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [hostId, limit, showAll]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    const supabase = createClient();
    const res = await fetchReviewsByHost(supabase, hostId, PAGE_SIZE, offset);
    if (res.success && res.data) {
      setReviews((prev) => [...prev, ...res.data!.reviews]);
      setOffset(offset + res.data.reviews.length);
    }
    setLoadingMore(false);
  };

  const t = {
    reviewsHeading: language === 'es' ? 'Reseñas' : 'Reviews',
    noReviews: language === 'es' ? 'Aún no hay reseñas' : 'No reviews yet',
    beTheFirst:
      language === 'es' ? 'Sé el primero en entrenar y dejar una reseña' : 'Be the first to train and leave a review',
    rated: language === 'es' ? 'Calificó' : 'Rated',
    stars: language === 'es' ? 'estrellas' : 'stars',
    seeAll: language === 'es' ? 'Ver todas las reseñas' : 'See all reviews',
    loadMore: language === 'es' ? 'Cargar más' : 'Load more',
    loading: language === 'es' ? 'Cargando…' : 'Loading…',
    reviewsCount: (n: number) =>
      language === 'es' ? `(${n} reseña${n === 1 ? '' : 's'})` : `(${n} review${n === 1 ? '' : 's'})`,
  };

  if (loading) {
    return <div className="py-8 text-center text-sm text-gray-400">{t.loading}</div>;
  }

  if (error) {
    return (
      <div className="py-8 text-center text-sm text-red-400">
        {language === 'es' ? 'No se pudieron cargar las reseñas' : 'Could not load reviews'}
      </div>
    );
  }

  const totalReviews = distribution?.total ?? total;
  const average = distribution?.average ?? 0;

  if (totalReviews === 0) {
    return (
      <div className="py-10 text-center">
        <Star size={28} className="mx-auto mb-2 text-gray-600" />
        <p className="text-sm font-medium text-gray-300">{t.noReviews}</p>
        <p className="mt-1 text-xs text-gray-500">{t.beTheFirst}</p>
      </div>
    );
  }

  const showDistribution = showAll && totalReviews >= 5 && distribution !== null;
  const displayedReviews = reviews;

  return (
    <div className="space-y-4">
      {/* Aggregate header */}
      <div className="bg-[#3D4349] rounded-xl p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white">{average.toFixed(1)}</span>
              <span className="text-sm text-gray-400">/ 5</span>
            </div>
            <div className="mt-1">
              <StarRow rating={Math.round(average)} />
            </div>
            <p className="mt-1 text-xs text-gray-400">{t.reviewsCount(totalReviews)}</p>
          </div>

          {showDistribution && distribution && (
            <div className="flex-1 max-w-xs space-y-1">
              {[5, 4, 3, 2, 1].map((stars) => (
                <DistributionBar
                  key={stars}
                  stars={stars}
                  count={distribution.distribution[stars as 1 | 2 | 3 | 4 | 5] || 0}
                  total={distribution.total}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Review cards */}
      <ul className="space-y-3">
        {displayedReviews.map((review) => {
          const sportKey = review.session_sport || '';
          const sportLabel = sportKey
            ? language === 'es'
              ? sportTranslations[sportKey]?.es || sportKey
              : sportTranslations[sportKey]?.en || sportKey
            : null;

          return (
            <li key={review.id} className="bg-[#3D4349] rounded-xl p-4 border border-transparent">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-[#272D34] flex-shrink-0 relative">
                  {review.reviewer?.avatar_url ? (
                    <Image
                      src={review.reviewer.avatar_url}
                      alt={review.reviewer.name || ''}
                      fill
                      sizes="32px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                      {(review.reviewer?.name || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-white truncate">
                      {review.reviewer?.name || (language === 'es' ? 'Atleta' : 'Athlete')}
                    </span>
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {formatRelativeTime(review.created_at, language)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <StarRow rating={review.rating} />
                    {sportLabel && (
                      <span className="text-xs text-gray-400 px-2 py-0.5 bg-[#272D34] rounded-full">{sportLabel}</span>
                    )}
                  </div>
                </div>
              </div>

              {review.comment ? (
                <p className="mt-3 text-sm text-gray-300 whitespace-pre-wrap break-words">{review.comment}</p>
              ) : (
                <p className="mt-3 text-xs text-gray-500 italic">
                  {t.rated} {review.rating} {t.stars}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {/* Pagination / "See all" */}
      {showAll
        ? reviews.length < totalReviews && (
            <div className="text-center pt-2">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-4 py-2 rounded-lg bg-[#3D4349] hover:bg-[#404549] text-sm text-gray-200 disabled:opacity-50"
              >
                {loadingMore ? t.loading : t.loadMore}
              </button>
            </div>
          )
        : totalReviews > displayedReviews.length &&
          seeAllHref && (
            <div className="text-center pt-1">
              <Link href={seeAllHref} className="text-sm font-medium text-[#84cc16] hover:text-[#A3E635]">
                {t.seeAll} →
              </Link>
            </div>
          )}
    </div>
  );
}
