'use client';

/**
 * VideoUploadSection: instructor intro video upload for the Storefront Editor.
 *
 * Uploads go to Cloudflare Stream by direct creator upload. The server mints a
 * one time URL, the browser PUTs the file straight to Cloudflare, and the
 * bytes never pass through Vercel. What lands in users.storefront_video_url is
 * the bare Stream uid, not a URL. VideoIntro reads both that and the legacy
 * Supabase URLs that three older rows still hold.
 *
 * Ordering is load bearing and must not be rearranged:
 *   1. remember the current value
 *   2. upload the new file
 *   3. write the new uid
 *   4. only then delete the old Stream video
 * Deleting before a confirmed write can leave an instructor with no video at
 * all. A delete that fails after step 3 is a billing leak, not a user facing
 * failure, so it is logged and never surfaced.
 *
 * Guardrails before any bytes leave the browser: it must be a video, it must
 * fit Cloudflare's 200 MB simple POST ceiling, and it must be 60 seconds or
 * less. Format is not checked because Stream transcodes anything common.
 *
 * All three run BEFORE the mint route is called. A file rejected after
 * minting would waste a direct upload URL, which reserves storage on
 * Cloudflare until it is used or expires.
 */

import { useRef, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Video, Loader, Upload, X, Play } from 'lucide-react';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { updateStorefrontProfile } from '@/lib/dal/instructorDashboard';
import {
  validateVideoSync,
  validateVideoDuration,
  isSlowUpload,
  toMegabytes,
  CLOUDFLARE_SIMPLE_UPLOAD_LIMIT_BYTES,
} from '@/lib/videoValidation';
import { resolveVideoSource, STREAM_IFRAME_ALLOW } from '@/lib/video/streamUrls';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';

interface VideoUploadSectionProps {
  supabase: SupabaseClient;
  userId: string;
  initialVideoUrl: string | null;
}

interface MintedUpload {
  uploadURL: string;
  uid: string;
}

/** A stored value is a Stream uid when it is not an absolute URL. */
function isStreamUid(value: string | null): value is string {
  return Boolean(value) && !String(value).toLowerCase().startsWith('http');
}

export default function VideoUploadSection({ supabase, userId, initialVideoUrl }: VideoUploadSectionProps) {
  const { t } = useLanguage();
  const [videoUrl, setVideoUrl] = useState<string | null>(initialVideoUrl);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Set when the mint route reports it has no Stream credentials. The surface
  // then disables itself instead of offering an uploader that cannot work.
  const [unavailable, setUnavailable] = useState(false);
  // The dashboard preview keeps the same click to play gate the storefront
  // uses. Cloudflare counts buffering as billable delivery, so the player is
  // mounted only when the instructor asks to watch their own video.
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Best effort cleanup of a replaced Stream video. Never surfaces an error:
   * by the time this runs the instructor's profile already points at the new
   * video, so a failure here is an orphaned billing line for us, not a
   * problem they can act on.
   */
  async function deleteReplacedVideo(uid: string) {
    try {
      const res = await fetch('/api/video/delete/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid }),
      });
      if (!res.ok) {
        logError(new Error(`delete failed with ${res.status}`), {
          action: 'VideoUploadSection.deleteReplacedVideo',
          userId,
          uid,
        });
      }
    } catch (err) {
      logError(err, { action: 'VideoUploadSection.deleteReplacedVideo', userId, uid });
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset the input so the same file can be re-selected after an error.
    if (inputRef.current) inputRef.current.value = '';

    const syncError = validateVideoSync(file);
    if (syncError === 'wrong_type') {
      showError(t('videoWrongType'));
      return;
    }
    if (syncError === 'too_large') {
      // Named sizes, because "too large" without a number is unactionable.
      showError(
        t('videoTooLarge')
          .replace('{size}', String(toMegabytes(file.size)))
          .replace('{limit}', String(toMegabytes(CLOUDFLARE_SIMPLE_UPLOAD_LIMIT_BYTES)))
      );
      return;
    }

    const durationError = await validateVideoDuration(file);
    if (durationError === 'too_long') {
      showError(t('videoTooLong'));
      return;
    }

    // Allowed, but big enough that silence would read as a hung upload.
    if (isSlowUpload(file)) {
      showInfo(t('videoLargeFileWarning').replace('{size}', String(toMegabytes(file.size))));
    }

    // Step 1: remember what is there now, before anything changes.
    const previous = videoUrl;

    setUploading(true);
    try {
      const mintRes = await fetch('/api/video/direct-upload/', { method: 'POST' });

      if (mintRes.status === 503) {
        // No Stream credentials in this environment. Disable rather than
        // letting the instructor try again into the same wall.
        setUnavailable(true);
        showError(t('videoUnavailable'));
        return;
      }

      if (!mintRes.ok) {
        showError(t('videoUploadError'));
        return;
      }

      const minted = (await mintRes.json()) as { success?: boolean; data?: MintedUpload };
      if (!minted.success || !minted.data?.uploadURL || !minted.data?.uid) {
        showError(t('videoUploadError'));
        return;
      }

      // Step 2: the bytes go straight to Cloudflare. Plain multipart POST with
      // a "file" field; Cloudflare answers 200 on success.
      const form = new FormData();
      form.append('file', file);
      const uploadRes = await fetch(minted.data.uploadURL, { method: 'POST', body: form });

      if (!uploadRes.ok) {
        showError(t('videoUploadError'));
        return;
      }

      // Step 3: the uid alone, never a URL.
      const result = await updateStorefrontProfile(supabase, userId, { storefront_video_url: minted.data.uid });
      if (!result.success) {
        showError(result.error || t('videoUploadError'));
        return;
      }

      setVideoUrl(minted.data.uid);
      setPreviewPlaying(false);
      showSuccess(t('videoSaved'));

      // Step 4, and only now. Their profile is already correct.
      if (isStreamUid(previous)) {
        void deleteReplacedVideo(previous);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('videoUploadError');
      showError(message);
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    const previous = videoUrl;
    setRemoving(true);
    try {
      const result = await updateStorefrontProfile(supabase, userId, { storefront_video_url: null });
      if (!result.success) {
        showError(result.error || t('videoUploadError'));
        return;
      }

      setVideoUrl(null);
      setPreviewPlaying(false);
      showSuccess(t('videoRemoved'));

      // Same rule as a replacement: clear the pointer first, then clean up.
      if (isStreamUid(previous)) {
        void deleteReplacedVideo(previous);
      } else if (previous) {
        // Legacy Supabase object, left over from the old upload path.
        await supabase.storage.from('media').remove([`storefront-videos/${userId}/intro.mp4`]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('videoUploadError');
      showError(message);
    } finally {
      setRemoving(false);
    }
  }

  const source = resolveVideoSource(videoUrl);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-theme-secondary flex items-center gap-1.5">
          <Video className="w-4 h-4" />
          {t('introVideo')}
        </label>
        <span className="text-xs text-theme-secondary">{t('introVideoHint')}</span>
      </div>

      {unavailable ? (
        <div className="flex flex-col items-center justify-center gap-2 h-28 rounded-xl border-2 border-dashed border-stone-300 dark:border-tribe-mid opacity-70">
          <Video className="w-6 h-6 text-stone-400" />
          <span className="text-sm font-medium text-theme-secondary text-center px-4">{t('videoUnavailable')}</span>
        </div>
      ) : source.kind !== 'unavailable' ? (
        /* Preview with replace and remove controls */
        <div className="relative rounded-xl overflow-hidden bg-black border border-stone-200 dark:border-tribe-mid">
          {source.kind === 'stream' && !previewPlaying ? (
            <button
              type="button"
              onClick={() => setPreviewPlaying(true)}
              className="relative block w-full h-40"
              aria-label={t('playVideo')}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={source.thumbnailUrl} alt="" aria-hidden="true" className="w-full h-full object-contain" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                <span className="w-12 h-12 rounded-full bg-tribe-green flex items-center justify-center">
                  <Play className="w-6 h-6 text-slate-900 fill-slate-900 ml-0.5" />
                </span>
              </span>
            </button>
          ) : source.kind === 'stream' ? (
            <>
              <iframe
                src={source.iframeUrl}
                title={t('introVideo')}
                className="w-full h-56 border-0"
                allow={STREAM_IFRAME_ALLOW}
                allowFullScreen
              />
              {/* Same handoff cover as the storefront player. See VideoIntro
                  for why this exists and why it is time based. */}
              <div
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none animate-out fade-out fill-mode-forwards delay-700 duration-500"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={source.thumbnailUrl} alt="" aria-hidden="true" className="w-full h-full object-contain" />
              </div>
            </>
          ) : (
            /* eslint-disable-next-line jsx-a11y/media-has-caption */
            <video src={source.src} controls playsInline className="w-full max-h-56 object-contain" />
          )}
          <div className="absolute bottom-2 right-2 flex gap-2">
            <label
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition bg-black/60 text-white hover:bg-black/80 ${
                uploading ? 'pointer-events-none opacity-60' : ''
              }`}
            >
              {uploading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {t('changeVideo')}
              <input
                ref={inputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleFileChange}
                disabled={uploading}
              />
            </label>
            <button
              type="button"
              onClick={handleRemove}
              disabled={removing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600/80 text-white hover:bg-red-600 transition disabled:opacity-60"
            >
              {removing ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              {t('removeVideo')}
            </button>
          </div>
        </div>
      ) : (
        /* Empty state upload trigger */
        <label
          className={`flex flex-col items-center justify-center gap-2 h-28 rounded-xl border-2 border-dashed border-stone-300 dark:border-tribe-mid cursor-pointer transition hover:border-tribe-green hover:bg-stone-50 dark:hover:bg-tribe-surface ${
            uploading ? 'pointer-events-none opacity-60' : ''
          }`}
        >
          {uploading ? (
            <Loader className="w-6 h-6 text-tribe-green animate-spin" />
          ) : (
            <Video className="w-6 h-6 text-stone-400" />
          )}
          <span className="text-sm font-medium text-theme-secondary">
            {uploading ? t('uploading') : t('uploadVideo')}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      )}
    </div>
  );
}
