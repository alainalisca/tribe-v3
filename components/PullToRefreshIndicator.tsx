'use client';

import { motion } from 'framer-motion';

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  threshold: number;
}

export default function PullToRefreshIndicator({ pullDistance, isRefreshing, threshold }: PullToRefreshIndicatorProps) {
  if (pullDistance === 0 && !isRefreshing) return null;

  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = progress * 360;

  return (
    <motion.div
      className="flex items-center justify-center overflow-hidden"
      animate={{ height: pullDistance }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <div className="relative">
        {isRefreshing ? (
          <div className="w-6 h-6 border-2 border-tribe-green border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg
            className="w-6 h-6 text-tribe-green transition-transform"
            style={{ transform: `rotate(${rotation}deg)`, opacity: progress }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path d="M12 4v8m0 0l-3-3m3 3l3-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </motion.div>
  );
}
