'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { showSuccess, showError } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { fetchSession, updateSession } from '@/lib/dal';
import type { EditSessionTranslations } from './translations';

export interface EditSessionFormData {
  sport: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  date: string;
  start_time: string;
  duration: number;
  max_participants: number;
  description: string;
  skill_level: string;
  gender_preference: string;
  equipment: string;
  join_policy: string;
}

const defaultFormData: EditSessionFormData = {
  sport: '',
  location: '',
  latitude: null,
  longitude: null,
  date: '',
  start_time: '',
  duration: 60,
  max_participants: 10,
  description: '',
  skill_level: 'all_levels',
  gender_preference: 'all',
  equipment: '',
  join_policy: 'open',
};

export function useEditSession(language: 'en' | 'es', txt: EditSessionTranslations) {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<EditSessionFormData>(defaultFormData);

  useEffect(() => {
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  async function loadSession() {
    try {
      const result = await fetchSession(supabase, params.id as string);
      if (!result.success || !result.data) throw new Error(result.error);

      const session = result.data;
      setFormData({
        sport: session.sport,
        location: session.location,
        latitude: session.latitude || null,
        longitude: session.longitude || null,
        date: session.date,
        start_time: session.start_time,
        duration: session.duration,
        max_participants: session.max_participants,
        description: session.description || '',
        skill_level: session.skill_level || 'all_levels',
        gender_preference: session.gender_preference || 'all',
        equipment: session.equipment || '',
        join_policy: session.join_policy || 'open',
      });
    } catch {
      showError(language === 'es' ? 'Error al cargar sesi\u00f3n' : 'Error loading session');
      router.back();
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const result = await updateSession(supabase, params.id as string, formData);
      if (!result.success) throw new Error(result.error);

      showSuccess(txt.updated);
      router.push(`/session/${params.id}`);
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'update_session', language));
    } finally {
      setSaving(false);
    }
  }

  return {
    loading,
    saving,
    formData,
    setFormData,
    handleSubmit,
    params,
    router,
  };
}
