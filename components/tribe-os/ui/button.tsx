'use client';

/**
 * Tribe.OS Button primitive.
 *
 * Ported from the sibling `tribe-os` codebase so /os/* surfaces use
 * the same building blocks called out in the design guidelines PDF.
 * Sits at components/tribe-os/ui/ to keep it namespaced away from
 * the consumer-app shadcn primitives at components/ui/.
 *
 * Variants:
 *   primary    — lime fill + dark text; pressed = darker green
 *   secondary  — light-gray fill, dark text; pressed = mid-gray
 *   danger     — red fill, white text
 *   ghost      — text-only, hovers to a light-gray bg
 *   outline    — border-only, hovers to lime border + lime text
 *
 * Sizes: sm / md / lg, all using rounded-tribe (10px radius).
 *
 * Loading state shows a Loader2 spinner before the children.
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const variantStyles: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-tribe-green text-tribe-dark font-semibold hover:bg-tribe-green-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
  secondary:
    'bg-tribe-dark-40 text-tribe-dark hover:bg-tribe-dark-60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
  danger:
    'bg-tribe-danger text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
  ghost: 'text-tribe-dark hover:bg-tribe-dark-40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
  outline:
    'border border-tribe-dark-60 text-tribe-dark hover:border-tribe-green hover:text-tribe-green-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
};

const sizeStyles: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-tribe',
  md: 'px-4 py-2 text-base rounded-tribe',
  lg: 'px-6 py-3 text-lg rounded-tribe',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading = false, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  )
);

Button.displayName = 'Button';

export default Button;
