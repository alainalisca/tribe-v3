'use client';

import { useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { showError, showInfo } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { useLanguage } from '@/lib/LanguageContext';

interface PhotoUploadSectionProps {
  supabase: SupabaseClient;
  userId: string;
  language: 'en' | 'es';
  photos: string[];
  onPhotosChange: (photos: string[]) => void;
}

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 1200;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX) {
            height *= MAX / width;
            width = MAX;
          }
        } else {
          if (height > MAX) {
            width *= MAX / height;
            height = MAX;
          }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob as Blob), 'image/jpeg', 0.8);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function PhotoUploadSection({
  supabase,
  userId,
  language,
  photos,
  onPhotosChange,
}: PhotoUploadSectionProps) {
  const { t } = useLanguage();
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (photos.length + files.length > 3) {
      showInfo(t('maxPhotosAllowed'));
      return;
    }
    setUploading(true);
    try {
      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressedBlob = await compressImage(file);
        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}/${Date.now()}-${i}.${fileExt}`;
        const { error } = await supabase.storage.from('session-photos').upload(fileName, compressedBlob, {
          cacheControl: '3600',
          upsert: false,
        });
        if (error) throw error;
        const {
          data: { publicUrl },
        } = supabase.storage.from('session-photos').getPublicUrl(fileName);
        uploadedUrls.push(publicUrl);
      }
      onPhotosChange([...photos, ...uploadedUrls]);
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'upload_photo', language));
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(index: number) {
    onPhotosChange(photos.filter((_, i) => i !== index));
  }

  return (
    <div>
      <label className="block text-sm font-medium text-theme-primary mb-2">
        <ImageIcon className="w-4 h-4 inline mr-2" />
        {t('locationPhotosMax')}
      </label>
      <p className="text-xs text-stone-500 mb-3">{t('helpFindMeetingSpot')}</p>
      <div className="flex gap-2 items-center">
        {photos.map((photo, index) => (
          <div key={index} className="relative w-20 h-20 flex-shrink-0">
            <img
              src={photo}
              alt={`Location ${index + 1}`}
              className="w-full h-full object-cover rounded-lg border-2 border-stone-200"
            />
            <button
              type="button"
              onClick={() => removePhoto(index)}
              className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {photos.length < 3 && (
          <label className="w-20 h-20 flex-shrink-0 border-2 border-dashed border-stone-300 rounded-lg cursor-pointer hover:border-tribe-green hover:bg-stone-50 transition flex items-center justify-center">
            {uploading ? (
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-tribe-green"></div>
            ) : (
              <Upload className="w-6 h-6 text-stone-400" />
            )}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        )}
      </div>
    </div>
  );
}
