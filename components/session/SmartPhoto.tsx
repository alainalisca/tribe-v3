'use client';

import { useState } from 'react';

interface SmartPhotoProps {
  src: string;
  alt: string;
  /** First cards in the feed load eagerly at high priority; the rest lazily. */
  eager?: boolean;
  /** Extra classes for the <img> itself (transforms, transitions). */
  className?: string;
  onError?: () => void;
}

/**
 * A photo that fills its box without decapitating anyone.
 *
 * Landscape photos are cropped with object-cover, focal point pulled up to
 * 25% because faces sit in the upper part of most fitness photos and dead
 * centre crops them.
 *
 * Portrait photos are never cropped. Instructors upload phone portraits, and
 * a portrait in a 4:3 box loses most of the frame. Instead the whole photo is
 * shown with object-contain over a blurred, darkened copy of itself, so the
 * box still reads as full. The backdrop and the photo share one src, so this
 * costs no extra download.
 *
 * Orientation is measured on load, so the first paint is object-cover; that is
 * the right guess for the majority and it never flashes for landscape photos.
 *
 * Extracted as its own component because T-UI4 reuses it for every slide of
 * the hero carousel.
 */
export default function SmartPhoto({ src, alt, eager = false, className = '', onError }: SmartPhotoProps) {
  const [isPortrait, setIsPortrait] = useState(false);

  function handleLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    if (img.naturalHeight > img.naturalWidth) setIsPortrait(true);
  }

  return (
    <>
      {isPortrait && (
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="absolute inset-[-20px] w-[calc(100%+40px)] h-[calc(100%+40px)] object-cover blur-[22px] brightness-[0.6]"
        />
      )}
      <img
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        // Spelled lowercase deliberately. Under react-dom 18.3.1 in the test
        // environment the camelCase `fetchPriority` prop is not recognised and
        // is dropped, so the hint never reaches the markup at all. The
        // lowercase attribute lands in both environments: verified in the
        // browser as fetchpriority="high" with img.fetchPriority === 'high'.
        //
        // The cost is one dev-only React warning ("Invalid DOM property
        // `fetchpriority`") which does not appear in production builds. The
        // attribute has to be in the initial render to be worth anything, so
        // setting it from a ref after mount is not an alternative. Revisit
        // when this app moves to React 19.
        {...({ fetchpriority: eager ? 'high' : 'auto' } as Record<string, string>)}
        decoding="async"
        onLoad={handleLoad}
        onError={onError}
        className={`absolute inset-0 w-full h-full ${
          isPortrait ? 'object-contain' : 'object-cover [object-position:center_25%]'
        } ${className}`}
      />
    </>
  );
}
