'use client';

/**
 * Tribe.OS StatCard — KPI tile with optional icon and trend.
 *
 * Renders a label, large value, and an optional MoM percentage change
 * with green up-arrow / red down-arrow. The lime icon chip sits in
 * the top-right corner.
 *
 * Ported from the sibling tribe-os codebase. Used on /os/dashboard
 * and elsewhere for consistent KPI presentation.
 */

import React from 'react';
import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  label: string;
  value: string | number;
  /** Percentage delta vs prior period; null or undefined hides the trend row. */
  change?: number | null;
  changeLabel?: string;
}

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ className, icon: Icon, label, value, change, changeLabel = 'vs last month', ...props }, ref) => {
    const hasChange = typeof change === 'number' && Number.isFinite(change);
    const isPositive = hasChange && (change as number) > 0;
    const isNegative = hasChange && (change as number) < 0;

    const showLabelRow = hasChange || !!changeLabel;

    return (
      <div ref={ref} className={cn('bg-white rounded-tribe shadow-tribe px-6 py-4', className)} {...props}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-tribe-dark-80 mb-1">{label}</p>
            <p className="text-3xl font-bold text-tribe-dark mb-2 leading-none">{value}</p>
            {showLabelRow ? (
              <div className="flex items-center gap-1 text-sm">
                {hasChange ? (
                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 font-semibold',
                      isPositive && 'text-tribe-success',
                      isNegative && 'text-tribe-danger',
                      !isPositive && !isNegative && 'text-tribe-dark-80'
                    )}
                  >
                    {isPositive ? <ArrowUp className="h-4 w-4" /> : null}
                    {isNegative ? <ArrowDown className="h-4 w-4" /> : null}
                    {Math.abs(change as number).toFixed(1)}%
                  </span>
                ) : null}
                {changeLabel ? <span className="text-tribe-dark-80">{changeLabel}</span> : null}
              </div>
            ) : null}
          </div>
          {Icon ? (
            <div className="ml-4 p-3 bg-tribe-green-50 rounded-tribe shrink-0">
              <Icon className="h-6 w-6 text-tribe-green-dark" />
            </div>
          ) : null}
        </div>
      </div>
    );
  }
);

StatCard.displayName = 'TribeStatCard';

export default StatCard;
