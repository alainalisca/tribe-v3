import { showSuccess, showError, showInfo } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { insertRecapPhoto, deleteRecapPhoto as dalDeleteRecapPhoto, updateRecapPhotoReport } from '@/lib/dal';

export interface RecapPhoto {
  id: string;
  photo_url: string;
  user_id: string | null;
  reported?: boolean | null;
  user?: { id: string; name: string | null; avatar_url: string | null };
}

export interface RecapPhotosProps {
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

export async function compressImage(file: File): Promise<Blob> {
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

        canvas.toBlob(
          (blob) => {
            resolve(blob as Blob);
          },
          'image/jpeg',
          0.8
        );
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export async function handleRecapUpload(
  e: React.ChangeEvent<HTMLInputElement>,
  user: { id: string } | null,
  sessionId: string,
  userPhotoCount: number,
  language: 'en' | 'es',
  onPhotosChanged: () => void,
  setUploadingRecap: (v: boolean) => void
) {
  if (!user) return;
  const files = e.target.files;
  if (!files || files.length === 0) return;

  const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  for (let i = 0; i < files.length; i++) {
    if (!allowedImageTypes.includes(files[i].type)) {
      showError(language === 'es' ? 'Tipo de archivo no válido' : 'Invalid file type');
      return;
    }
  }

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

      const { error } = await supabase.storage.from('session-photos').upload(fileName, compressedBlob, {
        cacheControl: '3600',
        upsert: false,
      });

      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from('session-photos').getPublicUrl(fileName);

      const insertResult = await insertRecapPhoto(supabase, {
        session_id: sessionId,
        user_id: user.id,
        photo_url: publicUrl,
      });

      if (!insertResult.success) throw new Error(insertResult.error);
    }

    showSuccess('Recap photos uploaded!');
    onPhotosChanged();
  } catch (error: unknown) {
    showError(getErrorMessage(error, 'upload_photo', language));
  } finally {
    setUploadingRecap(false);
  }
}

export async function deleteRecapPhoto(photoId: string, language: 'en' | 'es', onPhotosChanged: () => void) {
  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const result = await dalDeleteRecapPhoto(supabase, photoId);
    if (!result.success) throw new Error(result.error);

    showSuccess('Photo deleted');
    onPhotosChanged();
  } catch (error: unknown) {
    showError(getErrorMessage(error, 'delete_session', language));
  }
}

export async function reportRecapPhoto(
  photoId: string,
  user: { id: string } | null,
  language: 'en' | 'es',
  onPhotosChanged: () => void,
  reason?: string
) {
  if (!user) return;

  try {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();

    const result = await updateRecapPhotoReport(supabase, photoId, {
      reported: true,
      reported_by: user.id,
      reported_reason: reason || 'No reason provided',
    });
    if (!result.success) throw new Error(result.error);

    showSuccess(language === 'es' ? 'Foto reportada. Un admin la revisara.' : 'Photo reported. Admin will review.');
    onPhotosChanged();
  } catch (error: unknown) {
    showError(getErrorMessage(error, 'send_message', language));
  }
}
