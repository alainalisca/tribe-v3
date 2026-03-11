'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { log, logError } from '@/lib/logger';
import { reverseGeocodeGoogle } from '@/lib/google-maps';
import { insertParticipant, insertSession } from '@/lib/dal';

interface TrainingNowFormData {
  sport: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  startIn: number; // minutes
  duration: number; // minutes
}

const INITIAL_FORM_DATA: TrainingNowFormData = {
  sport: '',
  location: '',
  latitude: null,
  longitude: null,
  startIn: 30,
  duration: 60,
};

interface UseTrainingNowFormParams {
  isOpen: boolean;
  userId: string;
  language: 'en' | 'es';
  onSessionCreated: () => void;
  onClose: () => void;
}

export function useTrainingNowForm({ isOpen, userId, language, onSessionCreated, onClose }: UseTrainingNowFormParams) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [formData, setFormData] = useState<TrainingNowFormData>(INITIAL_FORM_DATA);

  // Body scroll locking handled by Radix Dialog

  useEffect(() => {
    if (isOpen) {
      getCurrentLocation();
    }
  }, [isOpen]);

  async function getCurrentLocation() {
    if (!navigator.geolocation) return;

    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setFormData((prev) => ({ ...prev, latitude, longitude }));

        // Reverse geocode to get address
        try {
          const name = await reverseGeocodeGoogle(latitude, longitude);
          if (name) {
            setFormData((prev) => ({ ...prev, location: name }));
          }
        } catch (e) {
          logError(e, { action: 'reverseGeocode' });
        }
        setGettingLocation(false);
      },
      (error) => {
        logError(error, { action: 'getCurrentLocation' });
        setGettingLocation(false);
      },
      { enableHighAccuracy: true }
    );
  }

  async function handleSubmit() {
    if (!formData.sport) {
      showInfo(language === 'es' ? 'Selecciona un deporte' : 'Select a sport');
      return;
    }
    if (!formData.location) {
      showInfo(language === 'es' ? 'Ingresa una ubicación' : 'Enter a location');
      return;
    }

    setLoading(true);
    try {
      // Calculate start time
      const startTime = new Date();
      startTime.setMinutes(startTime.getMinutes() + formData.startIn);

      const sessionDate = startTime.toISOString().split('T')[0];
      const sessionTime = startTime.toTimeString().slice(0, 5);

      // Create the session
      const sessionResult = await insertSession(supabase, {
        creator_id: userId,
        sport: formData.sport,
        location: formData.location,
        latitude: formData.latitude,
        longitude: formData.longitude,
        date: sessionDate,
        start_time: sessionTime,
        duration: formData.duration,
        max_participants: 10,
        current_participants: 1,
        status: 'active',
        is_immediate: true,
      });

      if (!sessionResult.success) throw new Error(sessionResult.error);
      const session = sessionResult.data!;

      // Add creator as participant
      const participantResult = await insertParticipant(supabase, {
        session_id: session.id,
        user_id: userId,
        status: 'confirmed',
      });
      if (!participantResult.success) throw new Error(participantResult.error);

      // Fire-and-forget: don't block UI waiting for notifications
      if (formData.latitude && formData.longitude) {
        notifyNearbyUsers(
          session.id,
          formData.sport,
          formData.location,
          formData.latitude,
          formData.longitude,
          formData.startIn
        );
      }

      showSuccess(
        language === 'es'
          ? '¡Sesión creada! Notificando a compañeros cercanos...'
          : 'Session created! Notifying nearby partners...'
      );
      onSessionCreated();
      onClose();

      // Reset form
      setFormData(INITIAL_FORM_DATA);
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
          creatorId: userId,
        }),
      });

      if (!response.ok) {
        log('error', 'Failed to notify nearby users', { action: 'notifyNearbyUsers', sessionId });
      }
    } catch (error) {
      logError(error, { action: 'notifyNearbyUsers', sessionId });
    }
  }

  return {
    loading,
    gettingLocation,
    formData,
    setFormData,
    getCurrentLocation,
    handleSubmit,
  };
}
