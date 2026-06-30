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

/** Shape expected by RecurringSessionToggle \u2014 kept separate from formData so
 *  the toggle component can own its pattern string rather than forcing a flat
 *  field into the main form.  Mirrors the shape used on the create page. */
export interface EditRecurringValue {
  is_recurring: boolean;
  recurrence_pattern: string;
  recurrence_end_date: string;
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

const defaultRecurring: EditRecurringValue = {
  is_recurring: false,
  recurrence_pattern: '',
  recurrence_end_date: '',
};

// photos is managed separately (not in formData) because PhotoUploadSection
// owns its own state shape: string[] rather than a form field value.
export type EditSessionPhotos = string[];

export function useEditSession(language: 'en' | 'es', txt: EditSessionTranslations) {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<EditSessionFormData>(defaultFormData);
  const [recurringValue, setRecurringValue] = useState<EditRecurringValue>(defaultRecurring);
  const [photos, setPhotos] = useState<EditSessionPhotos>([]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // Fetch current user and session in parallel so the photo uploader has a
    // userId as soon as the data is ready.
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
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

      // Initialise recurrence state from the existing session values.
      // recurrence_end_date is stored as ISO timestamp; strip time part so
      // the date input renders correctly.
      const endDateRaw = session.recurrence_end_date ?? '';
      const endDateForInput = endDateRaw ? endDateRaw.slice(0, 10) : '';
      setRecurringValue({
        is_recurring: session.is_recurring ?? false,
        recurrence_pattern: session.recurrence_pattern ?? '',
        recurrence_end_date: endDateForInput,
      });

      // Initialise photo state from the existing session photos (may be null)
      setPhotos(session.photos ?? []);
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
      // Build recurrence fields mirroring the create-page convention.
      // When turning off, null out the pattern and end_date so the DB row
      // doesn't retain stale values from the previous schedule.
      const recurringFields = recurringValue.is_recurring
        ? {
            is_recurring: true,
            recurrence_pattern: recurringValue.recurrence_pattern || null,
            recurrence_end_date: recurringValue.recurrence_end_date
              ? new Date(recurringValue.recurrence_end_date + 'T00:00:00').toISOString()
              : null,
          }
        : {
            is_recurring: false,
            recurrence_pattern: null,
            recurrence_end_date: null,
          };

      // Persist photos alongside the other edited fields. Passing null when
      // the array is empty clears any previously stored photos (matches the
      // create-flow convention in insertSession).
      const result = await updateSession(supabase, params.id as string, {
        ...formData,
        ...recurringFields,
        photos: photos.length > 0 ? photos : null,
      });
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
    recurringValue,
    setRecurringValue,
    photos,
    setPhotos,
    handleSubmit,
    params,
    router,
    supabase,
    userId,
  };
}
