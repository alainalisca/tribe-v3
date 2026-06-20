'use client';

import { useCallback, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { getCroppedImageFile } from '@/lib/cropImage';
import { logError } from '@/lib/logger';
import { showError } from '@/lib/toast';

interface ImageCropModalProps {
  /** Object URL (or data URL) of the image being cropped. */
  src: string;
  /** Crop box aspect ratio (width / height). Defaults to the wide banner ratio. */
  aspect?: number;
  language: 'en' | 'es';
  /** Receives the cropped JPEG (ready for compressImage/upload). */
  onConfirm: (file: File) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Zoom + pan crop modal for cover/banner images. The instructor frames the
 * image and we export that exact crop, so every place that shows the banner
 * (storefront, profile, share page) just renders the already-framed image with
 * no per-surface transform to keep in sync.
 */
export default function ImageCropModal({ src, aspect = 3, language, onConfirm, onCancel }: ImageCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_area: Area, areaPx: Area) => {
    setAreaPixels(areaPx);
  }, []);

  const t = {
    title: language === 'es' ? 'Ajusta tu foto de portada' : 'Adjust your cover photo',
    hint:
      language === 'es'
        ? 'Arrastra para mover; pellizca o usa el control para acercar.'
        : 'Drag to move; pinch or use the slider to zoom.',
    zoom: language === 'es' ? 'Acercar' : 'Zoom',
    cancel: language === 'es' ? 'Cancelar' : 'Cancel',
    save: language === 'es' ? 'Guardar portada' : 'Save cover',
  };

  const handleSave = async () => {
    if (!areaPixels || saving) return;
    setSaving(true);
    try {
      const file = await getCroppedImageFile(src, areaPixels);
      await onConfirm(file);
      // Parent unmounts the modal on success; no need to reset saving.
    } catch (err) {
      logError(err, { action: 'ImageCropModal.save' });
      showError(language === 'es' ? 'No se pudo recortar la imagen' : 'Could not crop the image');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t.title}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-t-2xl border border-theme bg-theme-card sm:rounded-2xl"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0px)' }}
      >
        <div className="p-4">
          <h2 className="text-base font-bold text-theme-primary">{t.title}</h2>
          <p className="mt-0.5 text-xs text-theme-tertiary">{t.hint}</p>
        </div>

        <div className="relative h-64 w-full bg-black">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            minZoom={1}
            maxZoom={3}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="space-y-4 p-4">
          <div className="flex items-center gap-3">
            <span className="w-12 text-xs text-theme-secondary">{t.zoom}</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-tribe-green"
              aria-label={t.zoom}
              disabled={saving}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="flex-1 rounded-xl bg-theme-surface py-2.5 text-sm font-semibold text-theme-secondary disabled:opacity-50"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !areaPixels}
              className="flex-1 rounded-xl bg-tribe-green py-2.5 text-sm font-bold text-slate-900 disabled:opacity-50"
            >
              {saving ? '…' : t.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
