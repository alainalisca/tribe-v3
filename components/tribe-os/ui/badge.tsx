'use client';

/**
 * Tribe.OS Badge — status indicator chip.
 *
 * Variants map to the canonical semantic tokens:
 *   default  — gray pill (neutral)
 *   success  — lime pill (Active, Healthy)
 *   warning  — peach pill (Watch, Pending)
 *   danger   — red pill (At Risk, Failed)
 *   info     — sky pill (Lead, Info)
 *
 * Ported from the sibling tribe-os codebase.
 */

import React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

const variantStyles: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'bg-tribe-dark-40 text-tribe-dark',
  success: 'bg-tribe-green-50 text-tribe-green-dark',
  warning: 'bg-tribe-peach text-tribe-warning',
  danger: 'bg-red-100 text-tribe-danger',
  info: 'bg-tribe-sky text-tribe-info',
};

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant = 'default', ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold',
      variantStyles[variant],
      className
    )}
    {...props}
  />
));

Badge.displayName = 'TribeBadge';

export default Badge;
