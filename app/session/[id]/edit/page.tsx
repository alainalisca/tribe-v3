'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import LocationPicker from '@/components/LocationPicker';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function EditSessionPage() {
  const router = useRouter();
  const params = useParams();
  const { language } = useLanguage();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    sport: '',
    location: '',
    latitude: null as number | null,
    longitude: null as number | null,
    date: '',
    start_time: '',
    duration: 60,
    max_participants: 100000,
    description: '',
  });

  useEffect(() => {
    loadSession();
  }, []);

  async function loadSession() {
    try {
      const { data: session, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', params.id)
        .single();

      if (error) throw error;

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
      });
    } catch (error) {
      alert('Error loading session');
      router.back();
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const { error } = await supabase
        .from('sessions')
        .update(formData)
        .eq('id', params.id);

      if (error) throw error;

      alert(language === 'es' ? 'Sesión actualizada' : 'Session updated');
      router.push(`/session/${params.id}`);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tribe-green"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-page pb-8 safe-area-top">
      <div className="bg-theme-card p-4 border-b border-theme">
        <div className="max-w-2xl mx-auto flex items-center">
          <Link href={`/session/${params.id}`}>
            <button className="p-2 hover:bg-stone-200 dark:hover:bg-[#52575D] rounded-lg transition mr-3">
              <ArrowLeft className="w-6 h-6 text-theme-primary" />
            </button>
          </Link>
          <h1 className="text-xl font-bold text-theme-primary">
            {language === 'es' ? 'Editar Sesión' : 'Edit Session'}
          </h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-theme-primary">
              {language === 'es' ? 'Deporte' : 'Sport'}
            </label>
            <input
              type="text"
              value={formData.sport}
              onChange={(e) => setFormData({ ...formData, sport: e.target.value })}
              className="w-full p-3 border border-theme rounded-lg bg-theme-card text-theme-primary"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-theme-primary">
              {language === 'es' ? 'Ubicación' : 'Location'}
            </label>
            <LocationPicker
              value={formData.location}
              onChange={(location, coords) => {
                setFormData(prev => ({
                  ...prev,
                  location,
                  latitude: coords?.lat ?? prev.latitude,
                  longitude: coords?.lng ?? prev.longitude,
                }));
              }}
              placeholder={language === 'es' ? 'ej. Parque Lleras' : 'e.g. Central Park'}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-theme-primary">
                {language === 'es' ? 'Fecha' : 'Date'}
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full p-3 border border-theme rounded-lg bg-theme-card text-theme-primary"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-theme-primary">
                {language === 'es' ? 'Hora' : 'Time'}
              </label>
              <input
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                className="w-full p-3 border border-theme rounded-lg bg-theme-card text-theme-primary"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-theme-primary">
              {language === 'es' ? 'Duración (minutos)' : 'Duration (minutes)'}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[15, 30, 45, 60, 90, 120, 150, 180].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setFormData({...formData, duration: mins})}
                  className={`p-3 rounded-lg font-medium transition-all ${
                    formData.duration === mins
                      ? 'bg-tribe-green text-slate-900 ring-2 ring-tribe-green'
                      : 'bg-theme-card border border-theme text-theme-primary hover:border-tribe-green'
                  }`}
                >
                  {mins < 60 ? `${mins}m` : `${Math.floor(mins/60)}h${mins % 60 ? ` ${mins % 60}m` : ''}`}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-theme-primary">
              {language === 'es' ? 'Descripción' : 'Description'}
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full p-3 border border-theme rounded-lg bg-theme-card text-theme-primary resize-none"
              rows={4}
              placeholder={language === 'es' ? 'Describe tu sesión...' : 'Describe your session...'}
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 disabled:opacity-50 transition"
            >
              {saving
                ? (language === 'es' ? 'Guardando...' : 'Saving...')
                : (language === 'es' ? 'Guardar Cambios' : 'Save Changes')}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-3 border border-theme rounded-lg text-theme-primary hover:bg-stone-100 dark:hover:bg-[#52575D] transition"
            >
              {language === 'es' ? 'Cancelar' : 'Cancel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
