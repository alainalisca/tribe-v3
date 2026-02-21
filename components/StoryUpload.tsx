'use client';

import { useState, useEffect } from 'react';
import { X, Camera, Video, Send } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { useLanguage } from '@/lib/LanguageContext';

interface StoryUploadProps {
  sessionId: string;
  userId: string;
  onClose: () => void;
  onUploaded?: () => void;
}

export default function StoryUpload({ sessionId, userId, onClose, onUploaded }: StoryUploadProps) {
  const supabase = createClient();
  const { language } = useLanguage();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  const t = language === 'es' ? {
    addStory: 'Agregar Historia',
    takePhoto: 'Foto o Cámara',
    chooseVideo: 'Elegir Video',
    caption: 'Escribe un pie de foto...',
    post: 'Publicar Historia',
    posting: 'Publicando...',
    success: '¡Historia publicada!',
    errorUpload: 'Error al subir la historia',
    fileTooLarge: 'Archivo muy grande. Máximo 10MB para fotos, 50MB para videos.',
  } : {
    addStory: 'Add Story',
    takePhoto: 'Photo or Camera',
    chooseVideo: 'Choose Video',
    caption: 'Write a caption...',
    post: 'Post Story',
    posting: 'Posting...',
    success: 'Story posted!',
    errorUpload: 'Failed to upload story',
    fileTooLarge: 'File too large. Max 10MB for photos, 50MB for videos.',
  };

  // Lock body scroll while modal is open
  useEffect(() => {
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.top = `-${scrollY}px`;
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      window.scrollTo(0, scrollY);
    };
  }, []);

  const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
  const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      const selected = e.target.files?.[0];
      if (!selected) return;

      const isVideo = selected.type.startsWith('video/');
      const limit = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
      if (selected.size > limit) {
        showInfo(t.fileTooLarge);
        e.target.value = '';
        return;
      }

      setMediaType(isVideo ? 'video' : 'image');
      setFile(selected);

      const url = URL.createObjectURL(selected);
      setPreview(url);
    } catch (error) {
      console.error('File select error:', error);
      showError(language === 'es' ? 'Error al seleccionar archivo' : 'Error selecting file');
    }
  }

  function clearSelection() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setCaption('');
  }

  async function generateVideoThumbnail(videoFile: File): Promise<Blob | null> {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      video.onloadeddata = () => {
        video.currentTime = 0.5;
      };

      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(video.videoWidth, 480);
        canvas.height = Math.min(video.videoHeight, 480);
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(video.src);
          resolve(blob);
        }, 'image/jpeg', 0.7);
      };

      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        resolve(null);
      };

      video.src = URL.createObjectURL(videoFile);
    });
  }

  async function compressImage(imageFile: File): Promise<Blob> {
    try {
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('FileReader failed'));
        reader.onload = (e) => {
          const img = new window.Image();
          img.onerror = () => reject(new Error('Image decode failed'));
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              const MAX = 1200;
              let w = img.width;
              let h = img.height;
              if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } }
              else { if (h > MAX) { w *= MAX / h; h = MAX; } }
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              if (!ctx) { resolve(imageFile); return; }
              ctx.drawImage(img, 0, 0, w, h);
              canvas.toBlob(
                (blob) => resolve(blob || imageFile),
                'image/jpeg',
                0.85
              );
            } catch { resolve(imageFile); }
          };
          img.src = e.target?.result as string;
        };
        reader.readAsDataURL(imageFile);
      });
    } catch (err) {
      console.warn('Image compression failed, using original:', err);
      return imageFile;
    }
  }

  async function handlePost() {
    if (!file) return;

    setUploading(true);
    try {
      const timestamp = Date.now();
      const ext = file.name.split('.').pop() || (mediaType === 'video' ? 'mp4' : 'jpg');
      const storagePath = `${sessionId}/${userId}/${timestamp}.${ext}`;

      // Compress images, upload videos as-is
      let uploadData: Blob | File = file;
      if (mediaType === 'image') {
        uploadData = await compressImage(file);
      }

      const { error: uploadError } = await supabase.storage
        .from('session-stories')
        .upload(storagePath, uploadData, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl: mediaUrl } } = supabase.storage
        .from('session-stories')
        .getPublicUrl(storagePath);

      // Generate and upload video thumbnail
      let thumbnailUrl: string | null = null;
      if (mediaType === 'video') {
        const thumbBlob = await generateVideoThumbnail(file);
        if (thumbBlob) {
          const thumbPath = `${sessionId}/${userId}/${timestamp}_thumb.jpg`;
          const { error: thumbError } = await supabase.storage
            .from('session-stories')
            .upload(thumbPath, thumbBlob, { cacheControl: '3600', upsert: false });

          if (!thumbError) {
            const { data: { publicUrl } } = supabase.storage
              .from('session-stories')
              .getPublicUrl(thumbPath);
            thumbnailUrl = publicUrl;
          }
        }
      }

      // Insert row
      const { error: insertError } = await supabase
        .from('session_stories')
        .insert({
          session_id: sessionId,
          user_id: userId,
          media_url: mediaUrl,
          media_type: mediaType,
          thumbnail_url: thumbnailUrl,
          caption: caption.trim() || null,
        });

      if (insertError) throw insertError;

      showSuccess(t.success);
      onUploaded?.();
      onClose();
    } catch (error: any) {
      console.error('Story upload error:', error);
      showError(t.errorUpload);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 flex flex-col" onClick={onClose}>
      {/* Spacer pushes content to bottom on picker screen, centers on preview */}
      <div className={preview ? 'flex-1 min-h-0' : 'flex-1'} />

      <div
        className="bg-white dark:bg-[#2C3137] w-full sm:max-w-md sm:mx-auto sm:rounded-xl rounded-t-2xl max-h-[85vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-stone-200 dark:border-gray-700 bg-white dark:bg-[#2C3137]">
          <h3 className="text-lg font-bold text-theme-primary">{t.addStory}</h3>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 dark:hover:bg-[#52575D] rounded-full transition">
            <X className="w-5 h-5 text-theme-primary" />
          </button>
        </div>

        {!preview ? (
          /* Invisible file inputs overlapping styled buttons — iOS WKWebView
             registers the tap as a direct user gesture on the file input */
          <div className="p-6 space-y-3">
            <div className="relative w-full">
              <div className="flex items-center gap-3 p-4 bg-tribe-green text-slate-900 rounded-xl font-semibold">
                <Camera className="w-5 h-5" />
                {t.takePhoto}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <div className="relative w-full">
              <div className="flex items-center gap-3 p-4 bg-stone-100 dark:bg-[#3D4349] text-theme-primary rounded-xl font-semibold">
                <Video className="w-5 h-5" />
                {t.chooseVideo}
              </div>
              <input
                type="file"
                accept="video/*"
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
          </div>
        ) : (
          /* Preview + caption */
          <div className="p-4 space-y-4">
            <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] flex items-center justify-center">
              {mediaType === 'image' ? (
                <img src={preview} alt="Preview" className="w-full h-full object-contain" />
              ) : (
                <video src={preview} controls playsInline className="w-full h-full object-contain" />
              )}
              <button
                onClick={clearSelection}
                className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full transition"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={t.caption}
              maxLength={200}
              className="w-full px-4 py-3 bg-stone-100 dark:bg-[#3D4349] border border-stone-200 dark:border-gray-600 rounded-xl text-theme-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-tribe-green"
            />

            <button
              onClick={handlePost}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 py-3 bg-tribe-green text-slate-900 font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-slate-900" />
                  {t.posting}
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  {t.post}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
