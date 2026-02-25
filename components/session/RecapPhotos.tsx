'use client';

import { useState } from 'react';
import { Camera, Upload, Trash2, Flag } from 'lucide-react';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';

interface RecapPhoto {
  id: string;
  photo_url: string;
  user_id: string | null;
  reported?: boolean | null;
}

interface RecapPhotosProps {
  session: { id: string };
  recapPhotos: RecapPhoto[];
  user: { id: string } | null;
  isPast: boolean;
  canUploadRecap: boolean;
  canModerate: boolean;
  shouldPromptUpload: boolean;
  userPhotoCount: number;
  language: 'en' | 'es';
  onOpenLightbox: (index: number, type: 'location' | 'recap') => void;
  onPhotosChanged: () => void;
}

export default function RecapPhotos({
  session,
  recapPhotos,
  user,
  isPast,
  canUploadRecap,
  canModerate,
  shouldPromptUpload,
  userPhotoCount,
  language,
  onOpenLightbox,
  onPhotosChanged,
}: RecapPhotosProps) {
  const [uploadingRecap, setUploadingRecap] = useState(false);

  async function compressImage(file: File): Promise<Blob> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            resolve(blob as Blob);
          }, 'image/jpeg', 0.8);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleRecapUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!user) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (userPhotoCount + files.length > 3) {
      showInfo('You can upload maximum 3 photos per session');
      return;
    }

    setUploadingRecap(true);
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressedBlob = await compressImage(file);
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-recap-${i}.${fileExt}`;

        const { error } = await supabase.storage
          .from('session-photos')
          .upload(fileName, compressedBlob, {
            cacheControl: '3600',
            upsert: false
          });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('session-photos')
          .getPublicUrl(fileName);

        const { error: insertError } = await supabase
          .from('session_recap_photos')
          .insert({
            session_id: session.id,
            user_id: user.id,
            photo_url: publicUrl
          });

        if (insertError) throw insertError;
      }

      showSuccess('Recap photos uploaded!');
      onPhotosChanged();
    } catch (error: any) {
      showError(getErrorMessage(error, 'upload_photo', language));
    } finally {
      setUploadingRecap(false);
    }
  }

  async function deleteRecapPhoto(photoId: string) {
    if (!confirm('Delete this photo?')) return;

    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      const { error } = await supabase
        .from('session_recap_photos')
        .delete()
        .eq('id', photoId);

      if (error) throw error;

      showSuccess('Photo deleted');
      onPhotosChanged();
    } catch (error: any) {
      showError(getErrorMessage(error, 'delete_session', language));
    }
  }

  async function reportRecapPhoto(photoId: string) {
    if (!user) return;
    const reason = prompt('Report reason (optional):');

    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      const { error } = await supabase
        .from('session_recap_photos')
        .update({
          reported: true,
          reported_by: user.id,
          reported_reason: reason || 'No reason provided'
        })
        .eq('id', photoId);

      if (error) throw error;

      showSuccess('Photo reported. Admin will review.');
      onPhotosChanged();
    } catch (error: any) {
      showError(getErrorMessage(error, 'send_message', language));
    }
  }

  return (
    <>
      {/* Upload Prompt Banner */}
      {shouldPromptUpload && (
        <div className="bg-gradient-to-r from-tribe-green to-lime-400 rounded-xl p-6 shadow-lg">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <Camera className="w-6 h-6 text-slate-900" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-900 mb-1">
                Share Your Experience! 📸
              </h3>
              <p className="text-sm text-slate-800">
                You attended this session - upload up to 3 photos to share with the community!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Session Recap Section */}
      {isPast && (
        <div className="bg-white dark:bg-[#6B7178] rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-tribe-green" />
              <h2 className="text-lg font-bold text-stone-900 dark:text-white">
                Session Recap
              </h2>
            </div>
            {canUploadRecap && (
              <span className="text-xs text-stone-500">
                {userPhotoCount}/3 uploaded
              </span>
            )}
          </div>

          {recapPhotos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              {recapPhotos.map((photo: any, idx: number) => (
                <div key={photo.id} className="relative aspect-square group">
                  <button
                    onClick={() => onOpenLightbox(idx, 'recap')}
                    className="w-full h-full rounded-lg overflow-hidden border-2 border-stone-200 hover:border-tribe-green transition active:scale-95"
                  >
                    <img loading="lazy"
                      src={photo.photo_url}
                      alt={`Recap ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>

                  <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
                    {photo.user?.name}
                  </div>

                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    {(photo.user_id === user?.id || canModerate) && (
                      <button
                        onClick={() => deleteRecapPhoto(photo.id)}
                        className="p-1 bg-red-500 text-white rounded hover:bg-red-600"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                    {canModerate && photo.user_id !== user?.id && (
                      <button
                        onClick={() => reportRecapPhoto(photo.id)}
                        className="p-1 bg-orange-500 text-white rounded hover:bg-orange-600"
                        title="Report"
                      >
                        <Flag className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {photo.reported && (
                    <div className="absolute top-1 left-1 bg-red-500 text-white text-xs px-1 py-0.5 rounded">
                      Reported
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {canUploadRecap && (
            <label className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition cursor-pointer flex items-center justify-center gap-2">
              {uploadingRecap ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-900"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  Upload Photos ({userPhotoCount}/3)
                </>
              )}
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleRecapUpload}
                disabled={uploadingRecap}
                className="hidden"
              />
            </label>
          )}

          {!canUploadRecap && recapPhotos.length === 0 && (
            <p className="text-sm text-center text-stone-500 py-4">
              {isPast
                ? 'No recap photos yet. Verified attendees can upload.'
                : 'Recap photos will be available after the session ends.'}
            </p>
          )}
        </div>
      )}
    </>
  );
}
