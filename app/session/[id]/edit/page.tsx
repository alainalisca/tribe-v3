'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import LocationPicker from '@/components/LocationPicker';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { showSuccess, showError } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';

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
    max_participants: 10,
    description: '',
    skill_level: 'all_levels',
    gender_preference: 'all',
    equipment: '',
    join_policy: 'open',
  });

  const txt =
    language === 'es'
      ? {
          editSession: 'Editar Sesión',
          sport: 'Deporte',
          location: 'Ubicación',
          date: 'Fecha',
          time: 'Hora',
          duration: 'Duración (minutos)',
          maxParticipants: 'Máx. participantes',
          description: 'Descripción',
          descPlaceholder: 'Describe tu sesión...',
          skillLevel: 'Nivel de habilidad',
          allLevels: 'Todos',
          beginner: 'Principiante',
          intermediate: 'Intermedio',
          advanced: 'Avanzado',
          genderPref: 'Preferencia de género',
          allWelcome: 'Todos',
          womenOnly: 'Solo mujeres',
          menOnly: 'Solo hombres',
          equipment: 'Equipamiento',
          equipmentPlaceholder: 'ej. Trae tu propia colchoneta',
          joinPolicy: 'Política de unión',
          open: 'Abierto - Cualquiera puede unirse',
          curated: 'Curado - Revisas solicitudes',
          inviteOnly: 'Solo invitación - Privado',
          save: 'Guardar Cambios',
          saving: 'Guardando...',
          cancel: 'Cancelar',
          updated: 'Sesión actualizada',
        }
      : {
          editSession: 'Edit Session',
          sport: 'Sport',
          location: 'Location',
          date: 'Date',
          time: 'Time',
          duration: 'Duration (minutes)',
          maxParticipants: 'Max participants',
          description: 'Description',
          descPlaceholder: 'Describe your session...',
          skillLevel: 'Skill Level',
          allLevels: 'All Levels',
          beginner: 'Beginner',
          intermediate: 'Intermediate',
          advanced: 'Advanced',
          genderPref: 'Gender Preference',
          allWelcome: 'All Welcome',
          womenOnly: 'Women Only',
          menOnly: 'Men Only',
          equipment: 'Equipment',
          equipmentPlaceholder: 'e.g. Bring your own mat',
          joinPolicy: 'Join Policy',
          open: 'Open - Anyone can join',
          curated: 'Curated - You review requests',
          inviteOnly: 'Invite Only - Private',
          save: 'Save Changes',
          saving: 'Saving...',
          cancel: 'Cancel',
          updated: 'Session updated',
        };

  useEffect(() => {
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  async function loadSession() {
    try {
      const { data: session, error } = await supabase.from('sessions').select('*').eq('id', params.id).single();

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
        skill_level: session.skill_level || 'all_levels',
        gender_preference: session.gender_preference || 'all',
        equipment: session.equipment || '',
        join_policy: session.join_policy || 'open',
      });
    } catch {
      showError(language === 'es' ? 'Error al cargar sesión' : 'Error loading session');
      router.back();
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const { error } = await supabase.from('sessions').update(formData).eq('id', params.id);

      if (error) throw error;

      showSuccess(txt.updated);
      router.push(`/session/${params.id}`);
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'update_session', language));
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
    <div className="min-h-screen bg-theme-page pb-8">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <Link href={`/session/${params.id}`}>
            <button className="p-2 hover:bg-stone-200 dark:hover:bg-[#52575D] rounded-lg transition mr-3">
              <ArrowLeft className="w-6 h-6 text-theme-primary" />
            </button>
          </Link>
          <h1 className="text-xl font-bold text-theme-primary">{txt.editSession}</h1>
        </div>
      </div>

      <div className="pt-header max-w-2xl mx-auto p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-theme-primary">{txt.sport}</label>
            <input
              type="text"
              value={formData.sport}
              onChange={(e) => setFormData({ ...formData, sport: e.target.value })}
              className="w-full p-3 border border-theme rounded-lg bg-theme-card text-theme-primary"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-theme-primary">{txt.skillLevel}</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { value: 'all_levels', label: txt.allLevels, emoji: '🌟' },
                { value: 'beginner', label: txt.beginner, emoji: '🌱' },
                { value: 'intermediate', label: txt.intermediate, emoji: '💪' },
                { value: 'advanced', label: txt.advanced, emoji: '🔥' },
              ].map((level) => (
                <button
                  key={level.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, skill_level: level.value })}
                  className={`p-3 rounded-lg font-medium transition-all text-center ${
                    formData.skill_level === level.value
                      ? 'bg-tribe-green text-slate-900 ring-2 ring-tribe-green'
                      : 'bg-theme-card border border-theme text-theme-primary hover:border-tribe-green'
                  }`}
                >
                  <div className="text-lg mb-1">{level.emoji}</div>
                  <div className="text-xs">{level.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-theme-primary">{txt.genderPref}</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'all', label: txt.allWelcome, emoji: '👥' },
                { value: 'women_only', label: txt.womenOnly, emoji: '👩' },
                { value: 'men_only', label: txt.menOnly, emoji: '👨' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, gender_preference: option.value })}
                  className={`p-3 rounded-lg font-medium transition-all text-center ${
                    formData.gender_preference === option.value
                      ? 'bg-tribe-green text-slate-900 ring-2 ring-tribe-green'
                      : 'bg-theme-card border border-theme text-theme-primary hover:border-tribe-green'
                  }`}
                >
                  <div className="text-lg mb-1">{option.emoji}</div>
                  <div className="text-xs">{option.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-theme-primary">{txt.location}</label>
            <LocationPicker
              value={formData.location}
              onChange={(location, coords) => {
                setFormData((prev) => ({
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
              <label className="block text-sm font-medium mb-2 text-theme-primary">{txt.date}</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full p-3 border border-theme rounded-lg bg-theme-card text-theme-primary"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-theme-primary">{txt.time}</label>
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
            <label className="block text-sm font-medium mb-2 text-theme-primary">{txt.duration}</label>
            <div className="grid grid-cols-4 gap-2">
              {[15, 30, 45, 60, 90, 120, 150, 180].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setFormData({ ...formData, duration: mins })}
                  className={`p-3 rounded-lg font-medium transition-all ${
                    formData.duration === mins
                      ? 'bg-tribe-green text-slate-900 ring-2 ring-tribe-green'
                      : 'bg-theme-card border border-theme text-theme-primary hover:border-tribe-green'
                  }`}
                >
                  {mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}`}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-theme-primary">{txt.maxParticipants}</label>
            <input
              type="number"
              value={formData.max_participants}
              onChange={(e) => setFormData({ ...formData, max_participants: parseInt(e.target.value) || 10 })}
              min="2"
              max="100000"
              className="w-full p-3 border border-theme rounded-lg bg-theme-card text-theme-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-theme-primary">{txt.joinPolicy}</label>
            <select
              value={formData.join_policy}
              onChange={(e) => setFormData({ ...formData, join_policy: e.target.value })}
              className="w-full p-3 border border-theme rounded-lg bg-theme-card text-theme-primary"
            >
              <option value="open">{txt.open}</option>
              <option value="curated">{txt.curated}</option>
              <option value="invite_only">{txt.inviteOnly}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-theme-primary">{txt.description}</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full p-3 border border-theme rounded-lg bg-theme-card text-theme-primary resize-none"
              rows={4}
              placeholder={txt.descPlaceholder}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-theme-primary">🎒 {txt.equipment}</label>
            <input
              type="text"
              value={formData.equipment}
              onChange={(e) => setFormData({ ...formData, equipment: e.target.value })}
              placeholder={txt.equipmentPlaceholder}
              className="w-full p-3 border border-theme rounded-lg bg-theme-card text-theme-primary"
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 disabled:opacity-50 transition"
            >
              {saving ? txt.saving : txt.save}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-3 border border-theme rounded-lg text-theme-primary hover:bg-stone-100 dark:hover:bg-[#52575D] transition"
            >
              {txt.cancel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
