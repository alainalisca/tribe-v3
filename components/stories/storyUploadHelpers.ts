import { log } from '@/lib/logger';

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_VIDEO_DURATION = 60; // seconds

export async function generateVideoThumbnail(videoFile: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve(null);
    }, 5000);

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadeddata = () => {
      video.currentTime = 0.5;
    };

    video.onseeked = () => {
      clearTimeout(timeout);
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(video.videoWidth, 480);
      canvas.height = Math.min(video.videoHeight, 480);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(video.src);
          resolve(blob);
        },
        'image/jpeg',
        0.7
      );
    };

    video.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(video.src);
      resolve(null);
    };

    video.src = URL.createObjectURL(videoFile);
  });
}

export async function compressImage(imageFile: File): Promise<Blob> {
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
            if (w > h) {
              if (w > MAX) {
                h *= MAX / w;
                w = MAX;
              }
            } else {
              if (h > MAX) {
                w *= MAX / h;
                h = MAX;
              }
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(imageFile);
              return;
            }
            ctx.drawImage(img, 0, 0, w, h);
            canvas.toBlob((blob) => resolve(blob || imageFile), 'image/jpeg', 0.85);
          } catch {
            resolve(imageFile);
          }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(imageFile);
    });
  } catch {
    log('warn', 'Image compression failed, using original', { action: 'compressImage' });
    return imageFile;
  }
}
