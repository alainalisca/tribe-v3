'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { resolveVideoSource, STREAM_IFRAME_ALLOW } from '@/lib/video/streamUrls';

// Title for the Stream embed. A plain object rather than a language ternary:
// the ternary pattern in this file predates the i18n move (UI-I01) and new
// strings should not add to it.
const IFRAME_TITLE = { en: 'Video introduction', es: 'Video de introducción' } as const;

interface VideoIntroProps {
  /**
   * Raw users.storefront_video_url. Two shapes, both supported: a full
   * Supabase URL on legacy rows, a bare Cloudflare Stream uid on new ones.
   * resolveVideoSource is the only thing that knows the difference.
   */
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
  // A Stream thumbnail is a real frame from the video, but it can 404 while
  // Cloudflare is still encoding. Fall back to the caller's poster rather
  // than showing a broken image.
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  const source = resolveVideoSource(videoUrl);

  // 'unavailable' covers an empty column AND a Stream uid with no configured
  // subdomain. Both render the empty state, never a half built embed.
  if (source.kind === 'unavailable') {
    if (!isOwnStorefront) return null;
    return (
      <div className="bg-theme-card rounded-2xl p-4 border border-dashed border-[#84cc16]/40">
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

  const streamThumbnail = source.kind === 'stream' && !thumbnailFailed ? source.thumbnailUrl : null;
  const effectivePoster = streamThumbnail ?? posterUrl ?? null;

  // The still frame, shared by the pre click button and the handoff cover so
  // the image cannot change across the transition.
  const posterFill = effectivePoster ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={effectivePoster} alt="" aria-hidden="true" className="w-full h-full object-cover" />
  ) : (
    <div className="w-full h-full bg-gradient-to-br from-[#3D4349] to-[#272D34]" />
  );

  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-black">
      {/*
        DO NOT mount the player before this click. This is a cost control, not
        a UI preference, and removing it costs real money on every storefront
        view. Cloudflare Stream bills by HTTP requests for video segments, and
        its own docs state that client side preloading and buffering counts as
        billable delivery. While the branch below renders only an image and a
        button, a storefront that loads and is never played costs zero delivery
        minutes. Mount an iframe or a video element here, even with
        preload="none", and every visitor who scrolls past starts paying,
        because the Stream player always loads some data to initialize itself.
        If you are here to "optimize" the click away, the optimization is the
        bug. Keep the poster as an image and mount the player only on click.
      */}
      {!playing ? (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="absolute inset-0 w-full h-full group"
          aria-label={language === 'es' ? 'Reproducir video' : 'Play video'}
        >
          {effectivePoster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={effectivePoster}
              alt=""
              aria-hidden="true"
              className="w-full h-full object-cover"
              onError={streamThumbnail ? () => setThumbnailFailed(true) : undefined}
            />
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
      ) : source.kind === 'stream' ? (
        <>
          {/* autoplay=true in the URL is correct for the same reason autoPlay
              is correct on the native element below: the viewer already
              clicked. STREAM_IFRAME_ALLOW delegates the permission. */}
          <iframe
            src={source.iframeUrl}
            title={IFRAME_TITLE[language]}
            className="w-full h-full border-0"
            allow={STREAM_IFRAME_ALLOW}
            allowFullScreen
          />
          {/*
            Handoff cover. Between mounting the iframe and autoplay actually
            starting, Cloudflare's player paints its own poster and its own
            white play button, so the viewer saw two play buttons in a row and
            the feature looked broken even though it worked.

            This holds our poster, the same image that was on screen a moment
            ago, over that gap and then fades itself out. Pure CSS through
            tailwindcss-animate, so there is no timer, no state and no player
            SDK: the element animates once on mount and stays transparent.
            pointer-events-none throughout, so it never intercepts a click
            meant for the player's own controls.

            The 700ms hold is a judgement, not a measurement, because without
            the Stream SDK there is no event that says playback began. If
            autoplay is slower than that on a poor connection the cover fades
            early and the viewer sees what they see today, so the worst case
            is the current behaviour rather than something new.
          */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none animate-out fade-out fill-mode-forwards delay-700 duration-500"
          >
            {posterFill}
          </div>
        </>
      ) : (
        <video
          controls
          autoPlay
          playsInline
          className="w-full h-full"
          src={source.src}
          poster={posterUrl || undefined}
        />
      )}
    </div>
  );
}
