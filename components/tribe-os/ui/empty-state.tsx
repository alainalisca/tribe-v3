'use client';

/**
 * Tribe.OS EmptyState — centered empty placeholder with icon, title,
 * description, and optional action button.
 *
 * Ported from the sibling tribe-os codebase. Use whenever a list /
 * grid / table has no data and you want a friendly explanation +
 * forward action.
 */

import React from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import Button from './button';

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, icon: Icon, title, description, actionLabel, onAction, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col items-center justify-center py-16 px-4', className)} {...props}>
      {Icon ? (
        <div className="mb-4 p-4 bg-tribe-green-50 rounded-tribe">
          <Icon className="h-10 w-10 text-tribe-green-dark" />
        </div>
      ) : null}
      <h3 className="text-lg font-semibold text-tribe-dark mb-2">{title}</h3>
      {description ? <p className="text-center text-tribe-dark-80 mb-6 max-w-sm">{description}</p> : null}
      {actionLabel && onAction ? (
        <Button onClick={onAction} variant="primary" size="md">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
);

EmptyState.displayName = 'TribeEmptyState';

export default EmptyState;
