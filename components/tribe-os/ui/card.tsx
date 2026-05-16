'use client';

/**
 * Tribe.OS Card primitives — flexible container with subcomponents.
 *
 *   <Card>
 *     <CardHeader>
 *       <CardTitle>…</CardTitle>
 *     </CardHeader>
 *     <CardContent>…</CardContent>
 *     <CardFooter>…</CardFooter>
 *   </Card>
 *
 * Default styling: white bg, rounded-tribe (10px), subtle shadow.
 * Header / Footer add their own dividers.
 *
 * Ported from the sibling tribe-os codebase. Lives under
 * components/tribe-os/ui/ so it doesn't collide with the
 * consumer-app shadcn `Card` at components/ui/card.tsx.
 */

import React from 'react';
import { cn } from '@/lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('bg-white rounded-tribe shadow-tribe', className)} {...props} />
));
Card.displayName = 'TribeCard';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('px-6 py-4 border-b border-tribe-dark-40', className)} {...props} />
  )
);
CardHeader.displayName = 'TribeCardHeader';

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h2 ref={ref} className={cn('text-lg font-semibold text-tribe-dark', className)} {...props} />
  )
);
CardTitle.displayName = 'TribeCardTitle';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('px-6 py-4', className)} {...props} />
);
CardContent.displayName = 'TribeCardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('px-6 py-4 border-t border-tribe-dark-40 flex items-center justify-end gap-2', className)}
      {...props}
    />
  )
);
CardFooter.displayName = 'TribeCardFooter';

export { Card, CardContent, CardFooter, CardHeader, CardTitle };
