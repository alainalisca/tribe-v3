'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, MapPin, Navigation } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { showSuccess, showError } from '@/lib/toast';
import { sportTranslations } from '@/lib/translations';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import Link from 'next/link';

export default function TrainingNowPage() {
  const supabase = createClient();
  const router = useRouter();
  const { language } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  
  const [formData, setFormData] = useState({
    sport: '',
    location: '',
    latitude: null as number | null,
    longitude: null as number | null,
    startIn: 30,
    duration: 60,
  });

  const sports = Object.keys(sportTranslations).filter(s => s !== 'All');

  const getTranslatedSport = (sport: string) => {
    if (language === 'es' && sportTranslations[sport]?.es) {
      return sportTranslations[sport].es;
    }
    return sport;
  };

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/');
        return;
      }
      setUser(user);
    }
    getUser();
    getCurrentLocation();
  }, []);

  async function getCurrentLocation() {
    setGettingLocation(true);
    try {
      if (!navigator.geolocation) {
        showError(language === 'es' ? 'Geolocalización no soportada' : 'Geolocation not supported');
        setGettingLocation(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setFormData(prev => ({ ...prev, latitude, longitude }));
          
          try {
            const response = await fetch(
              `/api/geocode?lat=${latitude}&lon=${longitude}`
            );
            const data = await response.json();
            if (data.display_name) {
              setFormData(prev => ({ ...prev, location: data.display_name }));
            }
          } catch (error) {
            console.error('Error getting address:', error);
          }
          setGettingLocation(false);
        },
        (error) => {
          console.error('Error getting location:', error);
          showError(language === 'es' ? 'No se pudo obtener ubicación' : 'Could not get location');
          setGettingLocation(false);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } catch (error) {
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
      
      const { data: session, error } = await supabase
        .from('sessions')
        .insert({
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
          description: language === 'es' 
            ? `¡Sesión espontánea de ${formData.sport}! Únete ahora.`
            : `Spontaneous ${formData.sport} session! Join now.`,
          status: 'active',
          is_training_now: true,
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from('session_participants').insert({
        session_id: session.id,
        user_id: user.id,
        status: 'confirmed',
      });

      await notifyNearbyUsers(session.id, formData.sport, formData.location, formData.latitude!, formData.longitude!, formData.startIn);

      showSuccess(language === 'es' ? '¡Sesión creada! Notificando compañeros cercanos...' : 'Session created! Notifying nearby partners...');
      router.push(`/session/${session.id}`);
    } catch (error: any) {
      console.error('Error creating session:', error);
      showError(error.message || 'Failed to create session');
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
          creatorId: user.id,
        }),
      });

      if (!response.ok) {
        console.error('Failed to notify nearby users');
      }
    } catch (error) {
      console.error('Error notifying nearby users:', error);
    }
  }

  const txt = language === 'es' ? {
    title: 'Entrenar Ahora',
    whatTraining: '¿Qué vas a entrenar?',
    where: '¿Dónde?',
    useLocation: 'Usar mi ubicación',
    whenStarting: '¿Cuándo empiezas?',
    now: 'Ahora',
    howLong: '¿Cuánto tiempo?',
    notify: 'NOTIFICAR COMPAÑEROS CERCANOS',
    creating: 'Creando...',
  } : {
    title: 'Training Now',
    whatTraining: 'What are you training?',
    where: 'Where?',
    useLocation: 'Use my location',
    whenStarting: 'When are you starting?',
    now: 'Now',
    howLong: 'How long?',
    notify: 'NOTIFY NEARBY PARTNERS',
    creating: 'Creating...',
  };

  const startOptions = [
    { value: 0, label: txt.now },
    { value: 30, label: '30 min' },
    { value: 60, label: '1 hour' },
  ];

  const durationOptions = [
    { value: 30, label: '30 min' },
    { value: 60, label: '1 hour' },
    { value: 90, label: '1.5 hrs' },
    { value: 120, label: '2 hours' },
  ];

  if (!user) return null;

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-[#404549] pb-24 safe-area-top">
      {/* Header */}
      <div className="bg-tribe-green p-4">
        <div className="flex items-center gap-3">
          <Link href="/">
            <button className="p-2 hover:bg-lime-500 rounded-full transition">
              <ArrowLeft className="w-6 h-6 text-slate-900" />
            </button>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">{txt.title}</h1>
        </div>
      </div>

      <div className="p-4 space-y-6 max-w-lg mx-auto">
        {/* Sport Selection */}
        <div>
          <label className="block text-sm font-bold text-stone-800 dark:text-white mb-3">{txt.whatTraining}</label>
          <div className="flex flex-wrap gap-2">
            {sports.map((sport) => (
              <button
                key={sport}
                onClick={() => setFormData({ ...formData, sport })}
                className={`px-4 py-2.5 rounded-full text-sm font-semibold transition ${
                  formData.sport === sport
                    ? 'bg-tribe-green text-slate-900'
                    : 'bg-white dark:bg-[#6B7178] text-stone-700 dark:text-white border border-stone-300 dark:border-transparent hover:bg-stone-100 dark:hover:bg-[#7B8188]'
                }`}
              >
                {getTranslatedSport(sport)}
              </button>
            ))}
          </div>
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-bold text-stone-800 dark:text-white mb-3">{txt.where}</label>
          <button
            onClick={getCurrentLocation}
            disabled={gettingLocation}
            className="w-full py-3 px-4 bg-tribe-green/20 text-tribe-green rounded-xl flex items-center justify-center gap-2 mb-3 font-semibold hover:bg-tribe-green/30 transition"
          >
            <Navigation className="w-5 h-5" />
            {gettingLocation ? '...' : txt.useLocation}
          </button>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder={language === 'es' ? 'ej. Parque Lleras' : 'e.g. Central Park'}
            className="w-full p-3 border border-stone-300 dark:border-[#52575D] rounded-xl bg-white dark:bg-[#6B7178] text-stone-800 dark:text-white placeholder-stone-400 dark:placeholder-gray-400"
          />
        </div>

        {/* When Starting */}
        <div>
          <label className="block text-sm font-bold text-stone-800 dark:text-white mb-3">{txt.whenStarting}</label>
          <div className="grid grid-cols-3 gap-3">
            {startOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setFormData({ ...formData, startIn: option.value })}
                className={`py-3 rounded-xl font-semibold transition ${
                  formData.startIn === option.value
                    ? 'bg-tribe-green text-slate-900'
                    : 'bg-white dark:bg-[#6B7178] text-stone-700 dark:text-white border border-stone-300 dark:border-transparent'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div>
          <label className="block text-sm font-bold text-stone-800 dark:text-white mb-3">{txt.howLong}</label>
          <div className="grid grid-cols-4 gap-2">
            {durationOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setFormData({ ...formData, duration: option.value })}
                className={`py-3 rounded-xl font-semibold transition text-sm ${
                  formData.duration === option.value
                    ? 'bg-tribe-green text-slate-900'
                    : 'bg-white dark:bg-[#6B7178] text-stone-700 dark:text-white border border-stone-300 dark:border-transparent'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={loading || !formData.sport || !formData.location}
          className="w-full py-4 bg-tribe-green text-slate-900 font-bold rounded-xl hover:bg-lime-500 transition disabled:opacity-50 disabled:cursor-not-allowed text-lg mt-4"
        >
          {loading ? txt.creating : txt.notify}
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
