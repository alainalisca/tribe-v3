'use client';

import { useState, type ReactNode } from 'react';
import { avatarInitials, usableAvatarUrl } from '@/lib/avatarSrc';
import { cn } from '@/lib/utils';

/**
 * T-JOIN1 Part C. A person's avatar that never shows a broken image or a stock
 * photo: the photo when it is usable and loads, else the initials block (or the
 * caller's own fallback, such as a notification's type icon).
 *
 * `className` sizes and shapes the box ("h-10 w-10"); it is round unless the
 * caller says otherwise. A plain <img>: avatars come from storage, provider
 * CDNs and old uploads, and next/image refuses any host it is not configured
 * for, which is one of the ways these used to break.
 */
export default function UserAvatar({
  src,
  name,
  className,
  textClassName,
  fallback,
  alt,
}: {
  src: string | null | undefined;
  name: string | null | undefined;
  className?: string;
  textClassName?: string;
  /** Shown instead of the initials when there is no usable photo. */
  fallback?: ReactNode;
  alt?: string;
}) {
  const url = usableAvatarUrl(src);
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = !!url && failed !== url;
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-stone-300 dark:bg-tribe-mid',
        className
      )}
      data-avatar={showPhoto ? 'photo' : 'initials'}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt ?? name ?? ''}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailed(url)}
        />
      ) : (
        (fallback ?? (
          <span className={cn('text-sm font-bold text-stone-600 dark:text-gray-300', textClassName)} aria-hidden="true">
            {avatarInitials(name)}
          </span>
        ))
      )}
    </span>
  );
}
