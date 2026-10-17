'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Play } from './icons';
import v from './home/tv.module.css';

/**
 * T-SITE1 Part E, Tribe.TV. The lite embed the old landing used
 * (TribeTVSection): the episode's own thumbnail until someone taps play, and
 * only then the YouTube player, on the privacy-enhanced youtube-nocookie host.
 * The page never loads YouTube's player script on first view. Strings come in
 * as props; this component imports no copy.
 */
export default function LitePlayer({
  id,
  title,
  thumb,
  alt,
  playLabel,
  priority = false,
}: {
  id: string;
  title: string;
  thumb: string;
  alt: string;
  playLabel: string;
  priority?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className={v.screen}>
      {playing ? (
        <iframe
          className={v.player}
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          className={v.tapToPlay}
          onClick={() => setPlaying(true)}
          aria-label={`${playLabel}: ${title}`}
        >
          <Image
            src={thumb}
            alt={alt}
            fill
            sizes="(max-width: 900px) 100vw, 62vw"
            preload={priority}
            fetchPriority={priority ? 'high' : undefined}
          />
          <span className={v.play}>
            <Play />
            {playLabel}
          </span>
        </button>
      )}
    </div>
  );
}
