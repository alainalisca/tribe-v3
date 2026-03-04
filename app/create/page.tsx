/** Page: /create — Create a new training session with sport, location, date, and settings */
'use client';
import { logError } from '@/lib/logger';
import { showSuccess, showError } from '@/lib/toast';
import { celebrateSessionCreated } from '@/lib/confetti';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import LocationPicker from '@/components/LocationPicker';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';
import type { User as AuthUser } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

import TemplateSection from './TemplateSection';
import PhotoUploadSection from './PhotoUploadSection';

type SessionTemplateRow = Database['public']['Tables']['session_templates']['Row'];
type FormErrors = Partial<Record<'sport' | 'date' | 'start_time' | 'location', string>>;

export default function CreateSessionPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t, language } = useLanguage();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    sport: '',
    date: '',
    start_time: '',
    duration: 60,
    location: '',
    latitude: null as number | null,
    longitude: null as number | null,
    description: '',
    max_participants: 10,
    join_policy: 'open',
    skill_level: 'all_levels',
    gender_preference: 'all',
    equipment: '',
  });

  const sports = Object.keys(sportTranslations).filter((s) => s !== 'All');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.push('/auth');
      else setUser(user);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) setErrors((prev) => ({ ...prev, [name]: '' }));
  }

  function handleLoadTemplate(template: SessionTemplateRow) {
    setFormData((prev) => ({
      ...prev,
      sport: template.sport,
      location: template.location,
      latitude: null,
      longitude: null,
      duration: template.duration,
      max_participants: template.max_participants,
      description: template.description || '',
    }));
  }

  function validate() {
    const newErrors: FormErrors = {};
    if (!formData.sport) newErrors.sport = language === 'es' ? 'El deporte es requerido' : 'Sport is required';
    if (!formData.date) newErrors.date = language === 'es' ? 'La fecha es requerida' : 'Date is required';
    if (!formData.start_time)
      newErrors.start_time = language === 'es' ? 'La hora es requerida' : 'Start time is required';
    if (!formData.location)
      newErrors.location = language === 'es' ? 'La ubicación es requerida' : 'Location is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('sessions')
        .insert({
          ...formData,
          creator_id: user!.id,
          current_participants: 0,
          status: 'active',
          photos: photos.length > 0 ? photos : null,
        })
        .select()
        .single();
      if (error) throw error;
      showSuccess(t('sessionCreated'));
      router.push('/');
      celebrateSessionCreated();
    } catch (error: unknown) {
      const err = error as Record<string, unknown> | null;
      logError(error, {
        action: 'handleSubmit',
        code: String(err?.code ?? ''),
        details: String(err?.details ?? ''),
        hint: String(err?.hint ?? ''),
      });
      const errorMsg = (err?.message ?? err?.code ?? err?.details ?? JSON.stringify(error)) as string;
      showError(language === 'es' ? `Error al crear sesión: ${errorMsg}` : `Session creation failed: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  }

  if (!user) return <div className="min-h-screen bg-theme-page flex items-center justify-center"></div>;

  const today = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <Link href="/">
            <button className="p-2 hover:bg-stone-200 rounded-lg transition mr-3">
              <ArrowLeft className="w-6 h-6 text-theme-primary" />
            </button>
          </Link>
          <h1 className="text-xl font-bold text-theme-primary">{t('createSession')}</h1>
        </div>
      </div>

      <div className="pt-header max-w-2xl mx-auto px-4 py-6">
        <TemplateSection
          supabase={supabase}
          userId={user.id}
          language={language}
          formData={formData}
          onLoadTemplate={handleLoadTemplate}
        />

        <div className="max-w-2xl mx-auto p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Sport */}
            <div>
              <label className="block text-sm font-medium text-theme-primary mb-2">{t('sport')} *</label>
              <select
                name="sport"
                value={formData.sport}
                onChange={handleChange}
                className={`w-full p-3 border rounded-lg bg-theme-card text-theme-primary ${errors.sport ? 'border-red-500' : 'border-theme'}`}
              >
                <option value="">{t('selectSport')}</option>
                {sports.map((sport) => (
                  <option key={sport} value={sport}>
                    {language === 'es' ? sportTranslations[sport]?.es || sport : sport}
                  </option>
                ))}
              </select>
              {errors.sport && <p className="text-red-500 text-sm mt-1">{errors.sport}</p>}
            </div>

            {/* Skill Level */}
            <div>
              <label className="block text-sm font-medium text-theme-primary mb-2">{t('skillLevel')}</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { value: 'all_levels', label: t('allLevels'), emoji: '🌟' },
                  { value: 'beginner', label: t('beginner'), emoji: '🌱' },
                  { value: 'intermediate', label: t('intermediate'), emoji: '💪' },
                  { value: 'advanced', label: t('advanced'), emoji: '🔥' },
                ].map((level) => (
                  <button
                    key={level.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, skill_level: level.value })}
                    className={`p-3 rounded-lg font-medium transition-all text-center ${formData.skill_level === level.value ? 'bg-tribe-green text-slate-900 ring-2 ring-tribe-green' : 'bg-theme-card border border-theme text-theme-primary hover:border-tribe-green'}`}
                  >
                    <div className="text-lg mb-1">{level.emoji}</div>
                    <div className="text-xs">{level.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Gender Preference */}
            <div>
              <label className="block text-sm font-medium text-theme-primary mb-2">{t('genderPreference')}</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'all', label: t('allWelcome'), emoji: '👥' },
                  { value: 'women_only', label: t('womenOnly'), emoji: '👩' },
                  { value: 'men_only', label: t('menOnly'), emoji: '👨' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, gender_preference: option.value })}
                    className={`p-3 rounded-lg font-medium transition-all text-center ${formData.gender_preference === option.value ? 'bg-tribe-green text-slate-900 ring-2 ring-tribe-green' : 'bg-theme-card border border-theme text-theme-primary hover:border-tribe-green'}`}
                  >
                    <div className="text-lg mb-1">{option.emoji}</div>
                    <div className="text-xs">{option.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-theme-primary mb-2">{t('date')} *</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  min={today}
                  className={`w-full p-3 border rounded-lg bg-theme-card text-theme-primary ${errors.date ? 'border-red-500' : 'border-theme'}`}
                />
                {errors.date && <p className="text-red-500 text-sm mt-1">{errors.date}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-theme-primary mb-2">{t('startTime')} *</label>
                <input
                  type="time"
                  name="start_time"
                  value={formData.start_time}
                  onChange={handleChange}
                  className={`w-full p-3 border rounded-lg bg-theme-card text-theme-primary ${errors.start_time ? 'border-red-500' : 'border-theme'}`}
                />
                {errors.start_time && <p className="text-red-500 text-sm mt-1">{errors.start_time}</p>}
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-theme-primary mb-2">{t('location')} *</label>
              <LocationPicker
                value={formData.location}
                onChange={(location, coords) => {
                  setErrors((prev) => ({ ...prev, location: '' }));
                  setFormData((prev) => ({
                    ...prev,
                    location,
                    latitude: coords?.lat ?? null,
                    longitude: coords?.lng ?? null,
                  }));
                }}
                placeholder={language === 'es' ? 'ej. Parque Lleras' : 'e.g. Central Park'}
                error={errors.location}
              />
            </div>

            {/* Duration */}
            <div>
              <label className="block text-sm font-medium text-theme-primary mb-2">
                {t('duration')} ({language === 'es' ? 'minutos' : 'minutes'})
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[15, 30, 45, 60, 90, 120, 150, 180].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setFormData({ ...formData, duration: mins })}
                    className={`p-3 rounded-lg font-medium transition-all ${formData.duration === mins ? 'bg-tribe-green text-slate-900 ring-2 ring-tribe-green' : 'bg-theme-card border border-theme text-theme-primary hover:border-tribe-green'}`}
                  >
                    {mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Max Participants */}
            <div>
              <label className="block text-sm font-medium text-theme-primary mb-2">{t('maxParticipants')}</label>
              <input
                type="number"
                name="max_participants"
                value={formData.max_participants}
                onChange={handleChange}
                min="2"
                max="100000"
                className="w-full p-3 border border-theme rounded-lg bg-theme-card text-theme-primary"
              />
            </div>

            {/* Join Policy */}
            <div>
              <label className="block text-sm font-medium text-theme-primary mb-2">
                {language === 'es' ? 'Política de unión' : 'Join Policy'}
              </label>
              <select
                name="join_policy"
                value={formData.join_policy}
                onChange={handleChange}
                className="w-full p-3 border border-theme rounded-lg bg-theme-card text-theme-primary"
              >
                <option value="open">
                  {language === 'es' ? 'Abierto - Cualquiera puede unirse' : 'Open - Anyone can join'}
                </option>
                <option value="curated">
                  {language === 'es' ? 'Curado - Revisas solicitudes' : 'Curated - You review requests'}
                </option>
                <option value="invite_only">
                  {language === 'es' ? 'Solo invitación - Privado' : 'Invite Only - Private'}
                </option>
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-theme-primary mb-2">{t('description')}</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                placeholder={language === 'es' ? 'Describe tu sesión...' : 'Describe your session...'}
                className="w-full p-3 border border-theme rounded-lg bg-theme-card text-theme-primary resize-none"
              />
            </div>

            {/* Equipment */}
            <div>
              <label className="block text-sm font-medium text-theme-primary mb-2">🎒 {t('equipment')}</label>
              <input
                type="text"
                name="equipment"
                value={formData.equipment}
                onChange={handleChange}
                placeholder={t('equipmentPlaceholder')}
                className="w-full p-3 border border-theme rounded-lg bg-theme-card text-theme-primary"
              />
            </div>

            {/* Photos */}
            <PhotoUploadSection
              supabase={supabase}
              userId={user.id}
              language={language}
              photos={photos}
              onPhotosChange={setPhotos}
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition disabled:opacity-50"
            >
              {loading ? (language === 'es' ? 'Creando...' : 'Creating...') : t('createSession')}
            </button>
          </form>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
