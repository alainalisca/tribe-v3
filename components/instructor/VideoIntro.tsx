'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';

interface VideoIntroProps {
  videoUrl: string | null | undefined;
  /** When true, show the "Add a video intro" prompt for instructors viewing their own storefront. */
  isOwnStorefront?: boolean;
  posterUrl?: string | null;
  language: 'en' | 'es';
  onRequestUpload?: () => void;
}

export default function VideoIntro({
  videoUrl,
  isOwnStorefront = false,
  posterUrl,
  language,
  onRequestUpload,
}: VideoIntroProps) {
  const [playing, setPlaying] = useState(false);

  if (!videoUrl) {
    if (!isOwnStorefront) return null;
    return (
      <div className="bg-[#3D4349] rounded-2xl p-4 border border-dashed border-[#84cc16]/40">
        <p className="text-sm font-semibold text-theme-primary">
          {language === 'es' ? 'Agrega un video de introducción' : 'Add a video introduction'}
        </p>
        <p className="text-xs text-theme-secondary mt-1">
          {language === 'es'
            ? 'Los perfiles con video obtienen 3x más reservas'
            : 'Profiles with video get 3x more bookings'}
        </p>
        {onRequestUpload && (
          <button
            type="button"
            onClick={onRequestUpload}
            className="mt-3 px-4 py-2 bg-tribe-green text-slate-900 rounded-lg text-sm font-semibold"
          >
            {language === 'es' ? 'Subir Video' : 'Upload Video'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
      {!playing ? (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="absolute inset-0 w-full h-full group"
          aria-label={language === 'es' ? 'Reproducir video' : 'Play video'}
        >
          {posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={posterUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#3D4349] to-[#272D34]" />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
            <div className="w-16 h-16 rounded-full bg-tribe-green flex items-center justify-center shadow-lg">
              <Play className="w-7 h-7 text-slate-900 fill-slate-900 ml-1" />
            </div>
          </div>
          <span className="absolute bottom-3 left-3 text-xs font-semibold text-white/90">
            {language === 'es' ? 'Video de Introducción' : 'Video Introduction'}
          </span>
        </button>
      ) : (
        <video controls autoPlay playsInline className="w-full h-full" src={videoUrl} poster={posterUrl || undefined} />
      )}
    </div>
  );
}
