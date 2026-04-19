'use client';

import { useState } from 'react';
import Image from 'next/image';

interface ProductImageCarouselProps {
  images: string[];
  title: string;
  categoryEmoji?: string;
}

export default function ProductImageCarousel({
  images,
  title,
  categoryEmoji = '\uD83D\uDCE6',
}: ProductImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (!images || images.length === 0) {
    return (
      <div className="w-full aspect-square bg-stone-200 dark:bg-tribe-surface flex items-center justify-center">
        <span className="text-7xl">{categoryEmoji}</span>
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-square bg-stone-200 dark:bg-tribe-surface">
      <Image src={images[activeIndex]} alt={title} fill className="object-cover" unoptimized />

      {/* Dots */}
      {images.length > 1 && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
          {images.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setActiveIndex(idx)}
              className={`w-2 h-2 rounded-full transition-colors ${idx === activeIndex ? 'bg-white' : 'bg-white/50'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
