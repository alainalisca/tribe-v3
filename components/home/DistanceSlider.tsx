'use client';

import type { TranslationKey } from '@/lib/translations';

interface DistanceSliderProps {
  maxDistance: number;
  setMaxDistance: (distance: number) => void;
  t: (key: TranslationKey) => string;
}

/** Radius filter. Only rendered once the athlete has granted location. */
export default function DistanceSlider({ maxDistance, setMaxDistance, t }: DistanceSliderProps) {
  return (
    <div className="flex items-center gap-3 bg-white dark:bg-tribe-card border border-stone-300 dark:border-tribe-mid rounded-lg px-3 py-1.5">
      <label className="text-xs font-medium text-stone-900 dark:text-gray-100 whitespace-nowrap" htmlFor="max-distance">
        {t('dist')}
      </label>
      <input
        id="max-distance"
        type="range"
        min="5"
        max="100"
        step="5"
        value={maxDistance}
        onChange={(e) => setMaxDistance(Number(e.target.value))}
        className="flex-1 h-1.5 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-tribe-green"
      />
      <span className="text-xs font-semibold text-tribe-green min-w-[48px] text-right flex-shrink-0">
        {maxDistance === 100 ? t('all') : `${maxDistance}km`}
      </span>
    </div>
  );
}
