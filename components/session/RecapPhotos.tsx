'use client';

import { useState } from 'react';
import { Camera, Upload, Trash2, Flag } from 'lucide-react';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useLanguage } from '@/lib/LanguageContext';
import { type RecapPhotosProps, handleRecapUpload, deleteRecapPhoto, reportRecapPhoto } from './recapPhotosHelpers';

// Re-export types for consumers
export type { RecapPhoto, RecapPhotosProps } from './recapPhotosHelpers';

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
  const { t } = useLanguage();
  const [uploadingRecap, setUploadingRecap] = useState(false);
  const [confirmDeletePhotoId, setConfirmDeletePhotoId] = useState<string | null>(null);

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
              <h3 className="text-lg font-bold text-slate-900 mb-1">{t('shareYourExperience')} 📸</h3>
              <p className="text-sm text-slate-800">{t('uploadPhotosDesc')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Session Recap Section */}
      {isPast && (
        <div className="bg-white dark:bg-tribe-card rounded-xl p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-tribe-green" />
              <h2 className="text-lg font-bold text-stone-900 dark:text-white">{t('sessionRecap')}</h2>
            </div>
            {canUploadRecap && (
              <span className="text-xs text-stone-500">
                {userPhotoCount}/3 {t('uploaded')}
              </span>
            )}
          </div>

          {recapPhotos.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
              {recapPhotos.map((photo, idx) => (
                <div key={photo.id} className="relative aspect-square group">
                  <button
                    onClick={() => onOpenLightbox(idx, 'recap')}
                    aria-label="View recap photo"
                    className="w-full h-full rounded-lg overflow-hidden border-2 border-stone-200 hover:border-tribe-green transition active:scale-95"
                  >
                    <img
                      loading="lazy"
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
                        onClick={() => setConfirmDeletePhotoId(photo.id)}
                        aria-label="Delete photo"
                        className="p-1 bg-red-500 text-white rounded hover:bg-red-600"
                        title={language === 'es' ? 'Eliminar' : 'Delete'}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                    {canModerate && photo.user_id !== user?.id && (
                      <button
                        onClick={() => reportRecapPhoto(photo.id, user, language, onPhotosChanged)}
                        aria-label="Report photo"
                        className="p-1 bg-orange-500 text-white rounded hover:bg-orange-600"
                        title="Report"
                      >
                        <Flag className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {photo.reported && (
                    <div className="absolute top-1 left-1 bg-red-500 text-white text-xs px-1 py-0.5 rounded">
                      {t('reported')}
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
                  {t('uploading')}
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  {t('photos')} ({userPhotoCount}/3)
                </>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                onChange={(e) =>
                  handleRecapUpload(e, user, session.id, userPhotoCount, language, onPhotosChanged, setUploadingRecap)
                }
                disabled={uploadingRecap}
                className="hidden"
              />
            </label>
          )}

          {!canUploadRecap && recapPhotos.length === 0 && (
            <p className="text-sm text-center text-stone-500 py-4">
              {isPast ? t('noRecapPhotos') : t('recapPhotosAfterSession')}
            </p>
          )}
        </div>
      )}
      <ConfirmDialog
        open={!!confirmDeletePhotoId}
        title={language === 'es' ? 'Eliminar foto' : 'Delete photo'}
        message={language === 'es' ? '¿Eliminar esta foto?' : 'Delete this photo?'}
        confirmLabel={language === 'es' ? 'Eliminar' : 'Delete'}
        cancelLabel={language === 'es' ? 'Cancelar' : 'Cancel'}
        variant="danger"
        onConfirm={() => {
          if (confirmDeletePhotoId) deleteRecapPhoto(confirmDeletePhotoId, language, onPhotosChanged);
          setConfirmDeletePhotoId(null);
        }}
        onCancel={() => setConfirmDeletePhotoId(null)}
      />
    </>
  );
}
