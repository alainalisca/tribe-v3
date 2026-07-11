/** Hook: useEditProfile — all edit profile state, effects, and handler functions */
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { logError } from '@/lib/logger';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { getEditProfileTranslations } from './translations';
import { fetchUserProfile, updateUser } from '@/lib/dal';
import { fetchMyPrivateProfile, upsertMyPrivateProfile } from '@/lib/dal/userPrivate';
import { compressImage } from '@/components/stories/storyUploadHelpers';
import { trackEvent } from '@/lib/analytics';
import type { User } from '@supabase/supabase-js';

/** Compress headshot to max 600px dimension at 85% JPEG quality */
async function compressAvatar(file: File): Promise<Blob> {
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

export interface EditProfileFormData {
  name: string;
  username: string;
  bio: string;
  location: string;
  sports: string[];
  photos: string[];
  avatar_url: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  instagram_username: string;
  facebook_url: string;
  // Instructor profile fields
  is_instructor: boolean;
  instructor_bio: string;
  specialties: string[];
  certifications: string[];
  years_experience: number | null;
  website_url: string;
  // Storefront fields (wizard step 2)
  storefront_tagline: string;
  storefront_banner_url: string;
  // Monetization fields (wizard step 3)
  earnings_currency: string;
}

export function useEditProfile(language: 'en' | 'es') {
  const router = useRouter();
  const supabase = createClient();
  const tr = getEditProfileTranslations(language);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // BUG-010: true only once the profile row has SUCCESSFULLY loaded into the
  // form. handleSave refuses to write while this is false, so a transient load
  // failure (which leaves the form at its empty initial state) can never
  // overwrite the real row with blanks.
  const [loadedOk, setLoadedOk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  const [formData, setFormData] = useState<EditProfileFormData>({
    name: '',
    username: '',
    bio: '',
    location: '',
    sports: [],
    photos: [],
    avatar_url: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    instagram_username: '',
    facebook_url: '',
    is_instructor: false,
    instructor_bio: '',
    specialties: [],
    certifications: [],
    years_experience: null,
    website_url: '',
    storefront_tagline: '',
    storefront_banner_url: '',
    earnings_currency: 'COP',
  });

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  async function loadProfile() {
    try {
      setError(null);
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) {
        router.push('/auth');
        return;
      }
      setUser(authUser);

      const [profileResult, privateResult] = await Promise.all([
        fetchUserProfile(supabase, authUser.id),
        fetchMyPrivateProfile(supabase, authUser.id),
      ]);
      // BUG-010: gate on .success, not just truthy data. fetchUserProfile
      // RETURNS its error (never throws), so the catch below won't fire on a
      // failed load — we must inspect .success here. loadedOk stays false on a
      // transient failure OR a missing row, which blocks handleSave from
      // writing the empty form over the real profile.
      if (!profileResult.success) {
        setLoadedOk(false);
        setError('load_failed');
        return;
      }
      const profileData = profileResult.data;
      // Emergency contact moved to user_private (T1-1).
      const priv = privateResult.success ? privateResult.data : null;

      if (profileData) {
        setLoadedOk(true);
        setFormData({
          name: profileData.name || '',
          username: profileData.username || '',
          bio: profileData.bio || '',
          location: profileData.location || '',
          sports: profileData.sports || [],
          photos: profileData.photos || [],
          avatar_url: profileData.avatar_url || '',
          emergency_contact_name: priv?.emergency_contact_name || '',
          emergency_contact_phone: priv?.emergency_contact_phone || '',
          instagram_username: profileData.instagram_username || '',
          facebook_url: profileData.facebook_url || '',
          is_instructor: profileData.is_instructor || false,
          instructor_bio: profileData.instructor_bio || '',
          specialties: profileData.specialties || [],
          certifications: profileData.certifications || [],
          years_experience: profileData.years_experience ?? null,
          website_url: profileData.website_url || '',
          storefront_tagline: profileData.storefront_tagline || '',
          storefront_banner_url: profileData.storefront_banner_url || '',
          earnings_currency: profileData.earnings_currency || 'COP',
        });
      }
    } catch (err) {
      logError(err, { action: 'loadProfile' });
      setError('load_failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedImageTypes.includes(file.type)) {
      showError(language === 'es' ? 'Tipo de archivo no válido' : 'Invalid file type');
      return;
    }

    try {
      setUploadingPhoto(true);
      // Compress to max 600px, quality 85 for headshot (smaller than gallery photos)
      const compressed = await compressAvatar(file);
      const path = `avatars/${user.id}-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(path, compressed, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('profile-images').getPublicUrl(path);

      // Cache-bust the URL so the new image shows immediately
      const bustedUrl = `${publicUrl}?t=${Date.now()}`;
      setFormData((prev) => ({ ...prev, avatar_url: bustedUrl }));
    } catch (error) {
      logError(error, { action: 'handleAvatarUpload' });
      showError(getErrorMessage(error, 'upload_photo', language));
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedImageTypes.includes(file.type)) {
      showError(language === 'es' ? 'Tipo de archivo no válido' : 'Invalid file type');
      return;
    }

    if (formData.photos.length >= 8) {
      showInfo(tr.maxPhotos);
      return;
    }

    try {
      setUploadingPhoto(true);

      const fileExt = file.name.split('.').pop();
      const fileName = `photo-${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `photos/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('profile-images').upload(filePath, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('profile-images').getPublicUrl(filePath);

      setFormData({
        ...formData,
        photos: [...formData.photos, publicUrl],
      });
    } catch (error) {
      logError(error, { action: 'handlePhotoUpload' });
      showError(getErrorMessage(error, 'upload_photo', language));
    } finally {
      setUploadingPhoto(false);
    }
  }

  function removePhoto(index: number) {
    setFormData({
      ...formData,
      photos: formData.photos.filter((_, i) => i !== index),
    });
  }

  // Cover-photo crop flow (#1): selecting a file opens the crop modal (zoom +
  // pan); the framed result is uploaded on confirm. bannerCropSrc holds the
  // object URL of the in-progress image (null = modal closed).
  const [bannerCropSrc, setBannerCropSrc] = useState<string | null>(null);

  function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showError(language === 'es' ? 'Tipo de archivo no válido' : 'Invalid file type');
      return;
    }

    // Open the crop modal instead of uploading the raw file directly.
    setBannerCropSrc(URL.createObjectURL(file));
  }

  function handleBannerCropCancel() {
    setBannerCropSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  async function handleBannerCropConfirm(file: File) {
    if (!user) return;
    try {
      setUploadingBanner(true);
      const compressed = await compressImage(file);
      const path = `banners/banner-${user.id}-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from('profile-images').upload(path, compressed, {
        contentType: 'image/jpeg',
      });
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('profile-images').getPublicUrl(path);

      setFormData({ ...formData, storefront_banner_url: publicUrl });
      handleBannerCropCancel();
    } catch (error) {
      logError(error, { action: 'handleBannerCropConfirm' });
      showError(getErrorMessage(error, 'upload_photo', language));
    } finally {
      setUploadingBanner(false);
    }
  }

  async function handleSave(overrides?: { specialties?: string[]; certifications?: string[] }) {
    if (!user) return;
    // BUG-010: never write from a form that never successfully loaded. Without
    // this, a transient load failure leaves the form empty and a Save would
    // overwrite the real profile with blanks (name/bio/location/sports/photos).
    if (!loadedOk) {
      showError(
        language === 'es'
          ? 'No se pudo cargar tu perfil. Recarga la página antes de guardar.'
          : 'Could not load your profile. Reload the page before saving.'
      );
      return;
    }

    try {
      setSaving(true);

      // Strip cache-busting query string from avatar_url before persisting.
      // When no dedicated headshot is set, fall back to the first gallery photo
      // so the user still shows an image everywhere (Browse Instructors,
      // messages, communities) — not just on their own profile, which already
      // does this fallback at render. Prevents the "image is gone" report where
      // a user uploaded gallery photos but never a headshot.
      const cleanAvatarUrl = formData.avatar_url
        ? formData.avatar_url.split('?')[0]
        : (formData.photos.find((p) => p && p.trim()) ?? null);

      // Emergency contact moved to user_private (T1-1) — written separately below.
      const updateResult = await updateUser(supabase, user.id, {
        name: formData.name,
        username: formData.username,
        bio: formData.bio,
        location: formData.location,
        sports: formData.sports,
        photos: formData.photos,
        avatar_url: cleanAvatarUrl,
        instagram_username: formData.instagram_username,
        facebook_url: formData.facebook_url,
        is_instructor: formData.is_instructor,
        instructor_bio: formData.instructor_bio || null,
        specialties: overrides?.specialties ?? formData.specialties,
        certifications: overrides?.certifications ?? formData.certifications,
        years_experience: formData.years_experience,
        website_url: formData.website_url || null,
        storefront_tagline: formData.storefront_tagline || null,
        storefront_banner_url: formData.storefront_banner_url || null,
        earnings_currency: formData.earnings_currency || 'COP',
        // Self-heal: an authenticated owner editing their own profile is
        // by definition an active account. Clears the zombie state the
        // old broken delete flow left behind (deleted_at set / inactive),
        // so previously-"deleted" accounts can save + display again.
        // RLS permits this — the users UPDATE policy is auth.uid()=id
        // with no deleted_at filter.
        deleted_at: null,
        is_active: true,
      });

      if (!updateResult.success) throw new Error(updateResult.error);

      // Emergency contact -> user_private (T1-1).
      const privateResult = await upsertMyPrivateProfile(supabase, user.id, {
        emergency_contact_name: formData.emergency_contact_name || null,
        emergency_contact_phone: formData.emergency_contact_phone || null,
      });
      if (!privateResult.success) throw new Error(privateResult.error);

      // LR-04 funnel: fire `profile_first_save` exactly once per user so
      // the onboarding → first-save conversion is countable. A localStorage
      // flag per user id is the cheapest dedupe that survives app restarts
      // without a server round trip. (Per-browser only — fine for this
      // funnel, which tracks activation behavior.)
      try {
        const flagKey = `tribe_profile_first_save_sent_${user.id}`;
        if (typeof window !== 'undefined' && !localStorage.getItem(flagKey)) {
          trackEvent('profile_first_save', { user_id: user.id });
          localStorage.setItem(flagKey, '1');
        }
      } catch {
        // localStorage can throw in privacy modes; non-fatal.
      }

      showSuccess(tr.profileUpdated);
      router.push('/profile');
    } catch (error: unknown) {
      logError(error, { action: 'handleSave' });
      showError(getErrorMessage(error, 'update_profile', language));
    } finally {
      setSaving(false);
    }
  }

  function toggleSport(sport: string) {
    if (formData.sports.includes(sport)) {
      setFormData({
        ...formData,
        sports: formData.sports.filter((s) => s !== sport),
      });
    } else {
      setFormData({
        ...formData,
        sports: [...formData.sports, sport],
      });
    }
  }

  return {
    tr,
    user,
    loading,
    error,
    loadedOk,
    saving,
    uploadingPhoto,
    uploadingBanner,
    formData,
    setFormData,
    handleAvatarUpload,
    handlePhotoUpload,
    handleBannerUpload,
    bannerCropSrc,
    handleBannerCropConfirm,
    handleBannerCropCancel,
    removePhoto,
    handleSave,
    toggleSport,
  };
}
