'use client';

import { useState } from 'react';
import Image from 'next/image';
import { X, ImagePlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { showError } from '@/lib/toast';

interface ProductImageUploadProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  userId: string;
  language: 'en' | 'es';
}

export default function ProductImageUpload({ images, onImagesChange, userId, language }: ProductImageUploadProps) {
  const supabase = createClient();
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (images.length + files.length > 5) {
      showError(language === 'es' ? 'M\u00E1ximo 5 im\u00E1genes' : 'Maximum 5 images');
      return;
    }

    setUploading(true);
    const newUrls: string[] = [];

    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop();
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('product-images').upload(path, file);

      if (error) {
        showError(error.message);
        continue;
      }

      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
      newUrls.push(urlData.publicUrl);
    }

    onImagesChange([...images, ...newUrls]);
    setUploading(false);
    e.target.value = '';
  }

  function handleRemove(index: number) {
    onImagesChange(images.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-theme-primary">
        {language === 'es' ? 'Im\u00E1genes (m\u00E1x 5)' : 'Images (max 5)'}
      </p>
      <div className="flex gap-2 flex-wrap">
        {images.map((url, idx) => (
          <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden bg-stone-200 dark:bg-tribe-surface">
            <Image src={url} alt="" fill className="object-cover" unoptimized />
            <button
              type="button"
              onClick={() => handleRemove(idx)}
              className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
        ))}

        {images.length < 5 && (
          <label className="w-20 h-20 rounded-xl border-2 border-dashed border-theme flex items-center justify-center cursor-pointer hover:border-tribe-green transition">
            {uploading ? (
              <div className="w-5 h-5 border-2 border-tribe-green border-t-transparent rounded-full animate-spin" />
            ) : (
              <ImagePlus className="w-6 h-6 text-theme-secondary" />
            )}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
        )}
      </div>
    </div>
  );
}
