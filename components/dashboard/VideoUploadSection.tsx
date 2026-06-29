'use client';

/**
 * VideoUploadSection — instructor intro video upload for the Storefront Editor.
 *
 * Guardrails (before any bytes reach Storage):
 *   - Rejects non-MP4 MIME types
 *   - Rejects files > 50 MB
 *   - Rejects duration > 60 s (via hidden video element)
 *
 * All error messages are bilingual EN/ES via the shared translation system.
 * Uploads go to the existing 'media' bucket under storefront-videos/<userId>/.
 * The public URL is written to users.storefront_video_url via the DAL.
 */

import { useRef, useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Video, Loader, Upload, X } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast';
import { updateStorefrontProfile } from '@/lib/dal/instructorDashboard';
import { validateVideoSync, validateVideoDuration } from '@/lib/videoValidation';
import { useLanguage } from '@/lib/LanguageContext';

interface VideoUploadSectionProps {
  supabase: SupabaseClient;
  userId: string;
  initialVideoUrl: string | null;
}

export default function VideoUploadSection({ supabase, userId, initialVideoUrl }: VideoUploadSectionProps) {
  const { t } = useLanguage();
  const [videoUrl, setVideoUrl] = useState<string | null>(initialVideoUrl);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset the input so the same file can be re-selected after an error.
    if (inputRef.current) inputRef.current.value = '';

    // Synchronous guards: type + size
    const syncError = validateVideoSync(file);
    if (syncError === 'wrong_type') {
      showError(t('videoWrongType'));
      return;
    }
    if (syncError === 'too_large') {
      showError(t('videoTooLarge'));
      return;
    }

    // Async guard: duration via hidden video element
    const durationError = await validateVideoDuration(file);
    if (durationError === 'too_long') {
      showError(t('videoTooLong'));
      return;
    }

    setUploading(true);
    try {
      const path = `storefront-videos/${userId}/${Date.now()}.mp4`;
      const { error: uploadError } = await supabase.storage.from('media').upload(path, file, { upsert: true });

      if (uploadError) {
        showError(uploadError.message || t('videoUploadError'));
        return;
      }

      const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      const result = await updateStorefrontProfile(supabase, userId, { storefront_video_url: publicUrl });
      if (!result.success) {
        showError(result.error || t('videoUploadError'));
        return;
      }

      setVideoUrl(publicUrl);
      showSuccess(t('videoSaved'));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('videoUploadError');
      showError(message);
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      const result = await updateStorefrontProfile(supabase, userId, { storefront_video_url: null });
      if (!result.success) {
        showError(result.error || t('videoUploadError'));
        return;
      }
      setVideoUrl(null);
      showSuccess(t('videoRemoved'));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('videoUploadError');
      showError(message);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-theme-secondary flex items-center gap-1.5">
          <Video className="w-4 h-4" />
          {t('introVideo')}
        </label>
        <span className="text-xs text-theme-secondary">{t('introVideoHint')}</span>
      </div>

      {videoUrl ? (
        /* Video preview with replace / remove controls */
        <div className="relative rounded-xl overflow-hidden bg-black border border-stone-200 dark:border-tribe-mid">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={videoUrl} controls playsInline className="w-full max-h-56 object-contain" />
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
                accept="video/mp4"
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
            accept="video/mp4"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      )}
    </div>
  );
}
