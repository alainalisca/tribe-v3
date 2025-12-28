'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';

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

  if (loading) return <div className="p-4">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6 text-theme-primary">
        {language === 'es' ? 'Editar Sesión' : 'Edit Session'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2 text-theme-primary">
            {language === 'es' ? 'Deporte' : 'Sport'}
          </label>
          <input
            type="text"
            value={formData.sport}
            onChange={(e) => setFormData({ ...formData, sport: e.target.value })}
            className="w-full p-2 border rounded bg-white dark:bg-stone-800 text-theme-primary"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 text-theme-primary">
            {language === 'es' ? 'Ubicación' : 'Location'}
          </label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            className="w-full p-2 border rounded bg-white dark:bg-stone-800 text-theme-primary"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 text-theme-primary">
            {language === 'es' ? 'Fecha' : 'Date'}
          </label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            className="w-full p-2 border rounded bg-white dark:bg-stone-800 text-theme-primary"
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
            className="w-full p-2 border rounded bg-white dark:bg-stone-800 text-theme-primary"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 text-theme-primary">
            {language === 'es' ? 'Duración (minutos)' : 'Duration (minutes)'}
          </label>
          <input
            type="number"
            value={formData.duration}
            onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) })}
            className="w-full p-2 border rounded bg-white dark:bg-stone-800 text-theme-primary"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2 text-theme-primary">
            {language === 'es' ? 'Descripción' : 'Description'}
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full p-2 border rounded bg-white dark:bg-stone-800 text-theme-primary"
            rows={4}
          />
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 disabled:opacity-50"
          >
            {saving
              ? (language === 'es' ? 'Guardando...' : 'Saving...')
              : (language === 'es' ? 'Guardar Cambios' : 'Save Changes')}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-3 border border-gray-300 rounded-lg text-theme-primary"
          >
            {language === 'es' ? 'Cancelar' : 'Cancel'}
          </button>
        </div>
      </form>
    </div>
  );
}
