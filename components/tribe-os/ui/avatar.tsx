'use client';

/**
 * Tribe.OS Avatar — circular badge with image fallback to initials.
 *
 * Sizes: sm (32px), md (40px), lg (56px). Lime border + lime fill so
 * empty avatars still feel branded.
 *
 * Ported from the sibling tribe-os codebase. Uses next/image when a
 * src is provided; falls back to initials on render error or when
 * src is empty.
 */

import React, { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  alt?: string;
  initials?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeStyles: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
};

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt = 'Avatar', initials, size = 'md', ...props }, ref) => {
    const [imageError, setImageError] = useState(false);
    const showImage = !!src && !imageError;

    return (
      <div
        ref={ref}
        className={cn(
          'relative inline-flex items-center justify-center rounded-full border-2 border-tribe-green bg-tribe-green-50 font-semibold text-tribe-green-dark flex-shrink-0 overflow-hidden',
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {showImage ? (
          <Image
            src={src as string}
            alt={alt}
            fill
            className="rounded-full object-cover"
            onError={() => setImageError(true)}
            sizes="56px"
          />
        ) : (
          <span>{initials || '?'}</span>
        )}
      </div>
    );
  }
);

Avatar.displayName = 'TribeAvatar';

export default Avatar;
