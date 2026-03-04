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
import type { User } from '@supabase/supabase-js';

export interface EditProfileFormData {
  name: string;
  username: string;
  bio: string;
  location: string;
  sports: string[];
  photos: string[];
  emergency_contact_name: string;
  emergency_contact_phone: string;
  instagram_username: string;
  facebook_url: string;
}

export function useEditProfile(language: 'en' | 'es') {
  const router = useRouter();
  const supabase = createClient();
  const tr = getEditProfileTranslations(language);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [formData, setFormData] = useState<EditProfileFormData>({
    name: '',
    username: '',
    bio: '',
    location: '',
    sports: [],
    photos: [],
    emergency_contact_name: '',
    emergency_contact_phone: '',
    instagram_username: '',
    facebook_url: '',
  });

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  async function loadProfile() {
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) {
        router.push('/auth');
        return;
      }
      setUser(authUser);

      const profileResult = await fetchUserProfile(supabase, authUser.id);
      const profileData = profileResult.data;

      if (profileData) {
        setFormData({
          name: profileData.name || '',
          username: profileData.username || '',
          bio: profileData.bio || '',
          location: profileData.location || '',
          sports: profileData.sports || [],
          photos: profileData.photos || [],
          emergency_contact_name: profileData.emergency_contact_name || '',
          emergency_contact_phone: profileData.emergency_contact_phone || '',
          instagram_username: profileData.instagram_username || '',
          facebook_url: profileData.facebook_url || '',
        });
      }
    } catch (error) {
      logError(error, { action: 'loadProfile' });
    } finally {
      setLoading(false);
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

    if (formData.photos.length >= 6) {
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

  async function handleSave() {
    if (!user) return;

    try {
      setSaving(true);

      const updateResult = await updateUser(supabase, user.id, {
        name: formData.name,
        username: formData.username,
        bio: formData.bio,
        location: formData.location,
        sports: formData.sports,
        photos: formData.photos,
        emergency_contact_name: formData.emergency_contact_name,
        emergency_contact_phone: formData.emergency_contact_phone,
        instagram_username: formData.instagram_username,
        facebook_url: formData.facebook_url,
      });

      if (!updateResult.success) throw new Error(updateResult.error);

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
    saving,
    uploadingPhoto,
    formData,
    setFormData,
    handlePhotoUpload,
    removePhoto,
    handleSave,
    toggleSport,
  };
}
