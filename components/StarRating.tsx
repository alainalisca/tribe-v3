'use client';

import { Star } from 'lucide-react';
import { useState } from 'react';

interface StarRatingProps {
  rating: number;
  onRatingChange?: (rating: number) => void;
  readonly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showValue?: boolean;
  totalReviews?: number;
}

export default function StarRating({
  rating,
  onRatingChange,
  readonly = false,
  size = 'md',
  showValue = false,
  totalReviews,
}: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState(0);

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  const displayRating = hoverRating || rating;

  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={readonly}
            onClick={() => !readonly && onRatingChange?.(star)}
            onMouseEnter={() => !readonly && setHoverRating(star)}
            onMouseLeave={() => !readonly && setHoverRating(0)}
            className={`${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'} transition-transform`}
          >
            <Star
              className={`${sizeClasses[size]} ${
                star <= displayRating
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'fill-none text-stone-300 dark:text-stone-500'
              } transition-colors`}
            />
          </button>
        ))}
      </div>
      {showValue && rating > 0 && (
        <span className="text-sm font-medium text-stone-700 dark:text-stone-300 ml-1">
          {rating.toFixed(1)}
          {totalReviews !== undefined && (
            <span className="text-stone-500 dark:text-stone-400 font-normal">
              {' '}({totalReviews})
            </span>
          )}
        </span>
      )}
    </div>
  );
}

// Compact version for displaying in cards
export function HostRatingBadge({
  rating,
  totalReviews,
}: {
  rating: number | null;
  totalReviews?: number;
}) {
  if (!rating || rating === 0) return null;

  return (
    <div className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-xs font-semibold">
      <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
      <span>{rating.toFixed(1)}</span>
      {totalReviews !== undefined && totalReviews > 0 && (
        <span className="text-yellow-600">({totalReviews})</span>
      )}
    </div>
  );
}
