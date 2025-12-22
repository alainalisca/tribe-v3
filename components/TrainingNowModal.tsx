'use client';

import { useState, useEffect } from 'react';
import { X, MapPin, Clock, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { sportTranslations } from '@/lib/translations';

interface TrainingNowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionCreated: () => void;
  userId: string;
}

export default function TrainingNowModal({ isOpen, onClose, onSessionCreated, userId }: TrainingNowModalProps) {
  const supabase = createClient();
  const { language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  
  const [formData, setFormData] = useState({
    sport: '',
    location: '',
    latitude: null as number | null,
    longitude: null as number | null,
    startIn: 30, // minutes
    duration: 60, // minutes
  });

  const sports = Object.keys(sportTranslations);

  const getTranslatedSport = (sport: string) => {
    if (language === 'es' && sportTranslations[sport]) {
      return sportTranslations[sport];
    }
    return sport;
  };

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [isOpen]);
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
        setFormData(prev => ({ ...prev, latitude, longitude }));
        
        // Reverse geocode to get address
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          );
          const data = await response.json();
          if (data?.display_name) {
            // Shorten the address
            const parts = data.display_name.split(',').slice(0, 3).join(',');
            setFormData(prev => ({ ...prev, location: parts }));
          }
        } catch (e) {
          console.error('Geocode error:', e);
        }
        setGettingLocation(false);
      },
      (error) => {
        console.error('Location error:', error);
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
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .insert({
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
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // Add creator as participant
      await supabase.from('session_participants').insert({
        session_id: session.id,
        user_id: userId,
        status: 'confirmed',
      });

      // Send notifications to nearby users
      if (formData.latitude && formData.longitude) {
        await notifyNearbyUsers(session.id, formData.sport, formData.location, formData.latitude, formData.longitude, formData.startIn);
      }

      showSuccess(language === 'es' ? '¡Sesión creada! Notificando a compañeros cercanos...' : 'Session created! Notifying nearby partners...');
      onSessionCreated();
      onClose();
      
      // Reset form
      setFormData({
        sport: '',
        location: '',
        latitude: null,
        longitude: null,
        startIn: 30,
        duration: 60,
      });
    } catch (error: any) {
      console.error('Error creating session:', error);
      showError(error.message || 'Error creating session');
    } finally {
      setLoading(false);
    }
  }

  async function notifyNearbyUsers(sessionId: string, sport: string, location: string, lat: number, lng: number, startIn: number) {
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
        console.error('Failed to notify nearby users');
      }
    } catch (error) {
      console.error('Notification error:', error);
    }
  }

  if (!isOpen) return null;

  const txt = language === 'es' ? {
    title: 'Entrenar Ahora',
    whatTraining: '¿Qué vas a entrenar?',
    where: '¿Dónde?',
    useLocation: '📍 Usar mi ubicación',
    gettingLocation: 'Obteniendo ubicación...',
    locationPlaceholder: 'ej. Bodytech Poblado',
    when: '¿Cuándo empiezas?',
    now: 'Ahora',
    min30: '30 min',
    hour1: '1 hora',
    howLong: '¿Cuánto tiempo?',
    min30dur: '30 min',
    hour1dur: '1 hora',
    hour15dur: '1.5 hrs',
    hour2dur: '2 horas',
    notify: '🔔 NOTIFICAR COMPAÑEROS CERCANOS',
    creating: 'Creando...',
  } : {
    title: 'Training Now',
    whatTraining: 'What are you training?',
    where: 'Where?',
    useLocation: '📍 Use my location',
    gettingLocation: 'Getting location...',
    locationPlaceholder: 'e.g. Central Park',
    when: 'When are you starting?',
    now: 'Now',
    min30: '30 min',
    hour1: '1 hour',
    howLong: 'How long?',
    min30dur: '30 min',
    hour1dur: '1 hour',
    hour15dur: '1.5 hrs',
    hour2dur: '2 hours',
    notify: '🔔 NOTIFY NEARBY PARTNERS',
    creating: 'Creating...',
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-[#404549] w-full max-w-md rounded-2xl max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-200 dark:border-gray-600 flex-shrink-0">
          <h2 className="text-lg font-bold text-theme-primary">{txt.title}</h2>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 dark:hover:bg-[#52575D] rounded-full">
            <X className="w-5 h-5 text-theme-primary" />
          </button>
        </div>

        <div className="p-4 space-y-5 overflow-y-auto flex-1">
          {/* Sport Selection */}
          <div>
            <label className="block text-sm font-medium text-theme-primary mb-2">{txt.whatTraining}</label>
            <div className="flex flex-wrap gap-2">
              {sports.slice(0, 12).map((sport) => (
                <button
                  key={sport}
                  onClick={() => setFormData({ ...formData, sport })}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                    formData.sport === sport
                      ? 'bg-tribe-green text-slate-900'
                      : 'bg-stone-100 dark:bg-[#52575D] text-theme-secondary hover:bg-stone-200'
                  }`}
                >
                  {getTranslatedSport(sport)}
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-theme-primary mb-2">{txt.where}</label>
            <button
              onClick={getCurrentLocation}
              disabled={gettingLocation}
              className="w-full mb-2 py-2 px-4 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition disabled:opacity-50"
            >
              {gettingLocation ? txt.gettingLocation : txt.useLocation}
            </button>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder={txt.locationPlaceholder}
              className="w-full p-3 border border-stone-300 dark:border-gray-600 rounded-xl bg-white dark:bg-[#52575D] text-theme-primary placeholder-gray-500"
            />
          </div>

          {/* Start Time */}
          <div>
            <label className="block text-sm font-medium text-theme-primary mb-2">{txt.when}</label>
            <div className="flex gap-2">
              {[
                { value: 0, label: txt.now },
                { value: 30, label: txt.min30 },
                { value: 60, label: txt.hour1 },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFormData({ ...formData, startIn: option.value })}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium transition ${
                    formData.startIn === option.value
                      ? 'bg-tribe-green text-slate-900'
                      : 'bg-stone-100 dark:bg-[#52575D] text-theme-secondary hover:bg-stone-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-theme-primary mb-2">{txt.howLong}</label>
            <div className="flex gap-2">
              {[
                { value: 30, label: txt.min30dur },
                { value: 60, label: txt.hour1dur },
                { value: 90, label: txt.hour15dur },
                { value: 120, label: txt.hour2dur },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFormData({ ...formData, duration: option.value })}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium transition ${
                    formData.duration === option.value
                      ? 'bg-tribe-green text-slate-900'
                      : 'bg-stone-100 dark:bg-[#52575D] text-theme-secondary hover:bg-stone-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Sticky Submit Button */}
        <div className="p-4 border-t border-stone-200 dark:border-gray-600 flex-shrink-0 bg-white dark:bg-[#404549]">
          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={loading || !formData.sport || !formData.location}
            className="w-full py-4 bg-tribe-green text-slate-900 font-bold rounded-xl hover:bg-lime-500 transition disabled:opacity-50 disabled:cursor-not-allowed text-lg"
          >
            {loading ? txt.creating : txt.notify}
          </button>
        </div>
      </div>
    </div>
  );
}
