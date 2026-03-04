'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { log, logError } from '@/lib/logger';
import { showSuccess, showError } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { reverseGeocodeGoogle } from '@/lib/google-maps';
import { insertParticipant, insertSession } from '@/lib/dal';
import type { User } from '@supabase/supabase-js';

export interface TrainingNowFormData {
  sport: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  startIn: number;
  duration: number;
}

export function useTrainingNow(language: 'en' | 'es') {
  const supabase = createClient();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

  const [formData, setFormData] = useState<TrainingNowFormData>({
    sport: '',
    location: '',
    latitude: null,
    longitude: null,
    startIn: 30,
    duration: 60,
  });

  useEffect(() => {
    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/');
        return;
      }
      setUser(user);
    }
    getUser();
    getCurrentLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  async function getCurrentLocation() {
    setGettingLocation(true);
    try {
      if (!navigator.geolocation) {
        showError(language === 'es' ? 'Geolocalizaci\u00f3n no soportada' : 'Geolocation not supported');
        setGettingLocation(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setFormData((prev) => ({ ...prev, latitude, longitude }));

          try {
            const name = await reverseGeocodeGoogle(latitude, longitude);
            if (name) {
              setFormData((prev) => ({ ...prev, location: name }));
            }
          } catch (error) {
            logError(error, { action: 'getCurrentLocation' });
          }
          setGettingLocation(false);
        },
        (error) => {
          logError(error, { action: 'getCurrentLocation' });
          showError(language === 'es' ? 'No se pudo obtener ubicaci\u00f3n' : 'Could not get location');
          setGettingLocation(false);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } catch {
      setGettingLocation(false);
    }
  }

  async function handleSubmit() {
    if (!user || !formData.sport || !formData.location) {
      showError(language === 'es' ? 'Por favor completa todos los campos' : 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const now = new Date();
      const startTime = new Date(now.getTime() + formData.startIn * 60000);

      const sessionResult = await insertSession(supabase, {
        creator_id: user.id,
        sport: formData.sport,
        date: startTime.toISOString().split('T')[0],
        start_time: startTime.toTimeString().split(' ')[0],
        duration: formData.duration,
        location: formData.location,
        latitude: formData.latitude,
        longitude: formData.longitude,
        max_participants: 10,
        join_policy: 'open',
        description:
          language === 'es'
            ? `\u00a1Sesi\u00f3n espont\u00e1nea de ${formData.sport}! \u00danete ahora.`
            : `Spontaneous ${formData.sport} session! Join now.`,
        status: 'active',
        is_training_now: true,
      });

      if (!sessionResult.success || !sessionResult.data) throw new Error(sessionResult.error);
      const session = sessionResult.data;

      const participantResult = await insertParticipant(supabase, {
        session_id: session.id,
        user_id: user.id,
        status: 'confirmed',
      });
      if (!participantResult.success) throw new Error(participantResult.error);

      // Fire-and-forget: don't block navigation waiting for notifications
      notifyNearbyUsers(
        session.id,
        formData.sport,
        formData.location,
        formData.latitude!,
        formData.longitude!,
        formData.startIn
      );

      showSuccess(
        language === 'es'
          ? '\u00a1Sesi\u00f3n creada! Notificando compa\u00f1eros cercanos...'
          : 'Session created! Notifying nearby partners...'
      );
      router.push(`/session/${session.id}`);
    } catch (error: unknown) {
      logError(error, { action: 'handleSubmit' });
      showError(getErrorMessage(error, 'create_session', language));
    } finally {
      setLoading(false);
    }
  }

  async function notifyNearbyUsers(
    sessionId: string,
    sport: string,
    location: string,
    lat: number,
    lng: number,
    startIn: number
  ) {
    try {
      const response = await fetch('/api/notify-nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          sport,
          location,
          latitude: lat,
          longitude: lng,
          startIn,
          creatorId: user!.id,
        }),
      });

      if (!response.ok) {
        log('error', 'Failed to notify nearby users', { action: 'notifyNearbyUsers', sessionId });
      }
    } catch (error) {
      logError(error, { action: 'notifyNearbyUsers' });
    }
  }

  return {
    user,
    loading,
    gettingLocation,
    formData,
    setFormData,
    getCurrentLocation,
    handleSubmit,
  };
}
