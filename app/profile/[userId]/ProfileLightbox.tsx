'use client';

import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface ProfileLightboxProps {
  photo: string;
  photos: string[] | null;
  lightboxIndex: number;
  onClose: () => void;
  onNavigate: (index: number, photo: string) => void;
}

export default function ProfileLightbox({ photo, photos, lightboxIndex, onClose, onNavigate }: ProfileLightboxProps) {
  const hasMultiple = photos && photos.length > 1;

  return (
    <div className="fixed inset-0 bg-black z-[60] flex items-center justify-center overflow-hidden" onClick={onClose}>
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition z-10"
      >
        <X className="w-8 h-8" />
      </button>

      {hasMultiple && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const newIndex = (lightboxIndex - 1 + photos.length) % photos.length;
              onNavigate(newIndex, photos[newIndex]);
            }}
            className="absolute left-4 p-2 text-white hover:bg-white/10 rounded-full transition"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const newIndex = (lightboxIndex + 1) % photos.length;
              onNavigate(newIndex, photos[newIndex]);
            }}
            className="absolute right-4 p-2 text-white hover:bg-white/10 rounded-full transition"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        </>
      )}

      <img
        src={photo}
        alt="Full size"
        onClick={(e) => e.stopPropagation()}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
      />
    </div>
  );
}
