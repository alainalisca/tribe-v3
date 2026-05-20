/** Hook: useProfile — all profile page state, effects, and handler functions */
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { logError } from '@/lib/logger';
import { showError } from '@/lib/toast';
import { getProfileTranslations } from './translations';
import { fetchUserProfile, updateUser, fetchSessionsByCreatorCount, fetchParticipantCountForUser } from '@/lib/dal';
import type { User } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type UserProfile = Database['public']['Tables']['users']['Row'];

export function useProfile(language: 'en' | 'es') {
  const router = useRouter();
  const supabase = createClient();
  const txt = getProfileTranslations(language);

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState({
    sessionsCreated: 0,
    sessionsJoined: 0,
    totalSessions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showAllSports, setShowAllSports] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // Lock body scroll and handle back button when lightbox is open
  useEffect(() => {
    function handlePopState() {
      if (selectedPhoto) {
        setSelectedPhoto(null);
      }
    }

    if (selectedPhoto) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${scrollY}px`;
      window.addEventListener('popstate', handlePopState);
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (selectedPhoto) {
        const scrollY = document.body.style.top;
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.top = '';
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    };
  }, [selectedPhoto]);

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
      setProfile(profileResult.data ?? null);

      const createdResult = await fetchSessionsByCreatorCount(supabase, authUser.id);
      const created = createdResult.success ? (createdResult.data ?? 0) : 0;

      const joinedResult = await fetchParticipantCountForUser(supabase, authUser.id);
      const joined = joinedResult.success ? (joinedResult.data ?? 0) : 0;

      setStats({
        sessionsCreated: created,
        sessionsJoined: joined,
        totalSessions: created + joined,
      });
    } catch (error) {
      logError(error, { action: 'loadProfile' });
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
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('profile-images').upload(filePath, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('profile-images').getPublicUrl(filePath);

      const updateResult = await updateUser(supabase, user.id, { avatar_url: publicUrl });

      if (!updateResult.success) throw new Error(updateResult.error);

      await loadProfile();
    } catch (error) {
      logError(error, { action: 'handleAvatarUpload' });
      showError(language === 'es' ? 'Error al subir la imagen' : 'Failed to upload image');
    }
  }

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedImageTypes.includes(file.type)) {
      showError(language === 'es' ? 'Tipo de archivo no válido' : 'Invalid file type');
      return;
    }

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `banner-${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `banners/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('profile-images').upload(filePath, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('profile-images').getPublicUrl(filePath);

      const updateResult = await updateUser(supabase, user.id, { banner_url: publicUrl });

      if (!updateResult.success) throw new Error(updateResult.error);

      await loadProfile();
    } catch (error) {
      logError(error, { action: 'handleBannerUpload' });
      showError(language === 'es' ? 'Error al subir el banner' : 'Failed to upload banner');
    }
  }

  function openPhoto(photo: string) {
    setSelectedPhoto(photo);
    history.pushState({ lightbox: true }, '');
  }

  function getInitials(name: string): string {
    return (
      name
        ?.split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'U'
    );
  }

  const sports = profile?.sports || [];
  const photos = profile?.photos || [];
  const displayedSports = showAllSports ? sports : sports.slice(0, 6);

  function getProfileCompleteness(): number | null {
    const fields = [
      !!profile?.name,
      !!profile?.avatar_url,
      !!profile?.bio,
      (profile?.sports?.length || 0) > 0,
      (profile?.photos?.length || 0) > 0,
      !!profile?.location,
    ];
    const filled = fields.filter(Boolean).length;
    const pct = Math.round((filled / fields.length) * 100);
    return pct >= 100 ? null : pct;
  }

  return {
    txt,
    user,
    profile,
    stats,
    loading,
    showAllSports,
    setShowAllSports,
    selectedPhoto,
    setSelectedPhoto,
    handleAvatarUpload,
    handleBannerUpload,
    openPhoto,
    getInitials,
    sports,
    photos,
    displayedSports,
    getProfileCompleteness,
    router,
  };
}
