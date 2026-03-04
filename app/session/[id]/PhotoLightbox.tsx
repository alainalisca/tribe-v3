'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface PhotoLightboxProps {
  photos: string[];
  initialIndex: number;
  onClose: () => void;
}

export default function PhotoLightbox({ photos, initialIndex, onClose }: PhotoLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);

  function handleTouchStart(e: React.TouchEvent) {
    setTouchStart(e.targetTouches[0].clientX);
  }
  function handleTouchMove(e: React.TouchEvent) {
    setTouchEnd(e.targetTouches[0].clientX);
  }
  function handleTouchEnd() {
    const minSwipeDistance = 50;
    const distance = touchStart - touchEnd;
    if (distance > minSwipeDistance && currentIndex < photos.length - 1) setCurrentIndex((prev) => prev + 1);
    if (distance < -minSwipeDistance && currentIndex > 0) setCurrentIndex((prev) => prev - 1);
  }

  return (
    <div className="fixed inset-0 bg-black z-[60] flex items-center justify-center overflow-hidden">
      <button
        onClick={onClose}
        className="absolute right-4 min-w-[44px] min-h-[44px] flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full transition z-10"
        style={{ top: 'max(1rem, env(safe-area-inset-top, 1rem))' }}
      >
        <X className="w-6 h-6 text-white" />
      </button>
      <div
        className="w-full h-full flex items-center justify-center touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <img
          loading="lazy"
          src={photos[currentIndex]}
          alt={`Photo ${currentIndex + 1}`}
          className="max-w-[90%] max-h-[90%] object-contain transition-opacity duration-300 select-none"
          draggable={false}
        />
      </div>
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-2">
        {photos.map((_: string, idx: number) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx)}
            className={`w-2 h-2 rounded-full transition-all ${idx === currentIndex ? 'bg-white w-6' : 'bg-white/40'}`}
          />
        ))}
      </div>
      <div className="absolute bottom-4 text-white text-sm">
        {currentIndex + 1} / {photos.length}
      </div>
    </div>
  );
}
