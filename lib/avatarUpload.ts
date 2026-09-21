import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The ONE place an avatar is compressed and uploaded.
 *
 * It lived inline in app/profile/edit/useEditProfile.ts. The athlete
 * onboarding step needs the same behaviour, and copying it would have put the
 * 600px/0.85 constants in two modules -- the defect CLAUDE.md records under
 * "the same constant name in five modules is not five constants, it is one
 * defect", where SPORTS_LIST drifted until an instructor could not tag
 * Jiu-Jitsu.
 *
 * 600px matches what migration 183 rewrites Google avatars to, so an uploaded
 * headshot and a provider one end up equivalent. A 128px circle at 3x needs
 * ~384px, so 600 has room.
 *
 * Every failure path resolves to the ORIGINAL file rather than rejecting: a
 * browser that cannot decode the image should still upload something, and an
 * un-compressed avatar is a far better outcome than no avatar.
 */
/** Compress headshot to max 600px dimension at 85% JPEG quality */
export async function compressAvatar(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(file);
    reader.onload = (e) => {
      const img = new window.Image();
      img.onerror = () => resolve(file);
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const MAX = 600;
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
            resolve(file);
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', 0.85);
        } catch {
          resolve(file);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export interface AvatarUploadResult {
  /** Cache-busted, so the new image shows immediately rather than the old one. */
  publicUrl: string;
}

/**
 * Compress, upload to profile-images/avatars, and return a cache-busted URL.
 * Throws on upload failure so the caller decides what the user sees -- this
 * helper has no opinion about copy.
 */
export async function uploadAvatar(supabase: SupabaseClient, userId: string, file: File): Promise<AvatarUploadResult> {
  const compressed = await compressAvatar(file);
  const path = `avatars/${userId}-${Date.now()}.jpg`;

  const { error } = await supabase.storage
    .from('profile-images')
    .upload(path, compressed, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;

  const {
    data: { publicUrl },
  } = supabase.storage.from('profile-images').getPublicUrl(path);

  return { publicUrl: `${publicUrl}?t=${Date.now()}` };
}
