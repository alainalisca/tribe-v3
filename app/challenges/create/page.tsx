'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { createChallenge, ChallengeType } from '@/lib/dal/challenges';
import { sportTranslations } from '@/lib/translations';
import { ArrowLeft, Loader } from 'lucide-react';

const CHALLENGE_TYPES: { value: ChallengeType; label: string; labelEs: string }[] = [
  { value: 'session_count', label: 'Session Count', labelEs: 'Contador de sesiones' },
  { value: 'streak', label: 'Streak', labelEs: 'Racha' },
  { value: 'sport_variety', label: 'Sport Variety', labelEs: 'Variedad de deportes' },
  { value: 'custom', label: 'Custom', labelEs: 'Personalizado' },
];

export default function CreateChallengePage() {
  const router = useRouter();
  const { language } = useLanguage();
  const supabase = createClient();

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    challengeType: 'session_count' as ChallengeType,
    targetValue: 10,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    sport: '',
    coverImageUrl: '',
    isPublic: true,
  });

  const t = {
    en: {
      createChallenge: 'Create Challenge',
      back: 'Back',
      title: 'Title',
      description: 'Description',
      type: 'Challenge Type',
      targetValue: 'Target Value',
      startDate: 'Start Date',
      endDate: 'End Date',
      sport: 'Sport (Optional)',
      coverImage: 'Cover Image URL (Optional)',
      visibility: 'Visibility',
      public: 'Public',
      private: 'Private',
      sessions: 'sessions',
      days: 'days',
      sports: 'sports',
      units: 'units',
      create: 'Create Challenge',
      creating: 'Creating...',
      error: 'Error creating challenge',
      success: 'Challenge created!',
      requiredField: 'This field is required',
      dateRange: 'End date must be after start date',
    },
    es: {
      createChallenge: 'Crear Reto',
      back: 'Atrás',
      title: 'Título',
      description: 'Descripción',
      type: 'Tipo de Reto',
      targetValue: 'Valor Objetivo',
      startDate: 'Fecha de inicio',
      endDate: 'Fecha de fin',
      sport: 'Deporte (Opcional)',
      coverImage: 'URL de imagen de portada (Opcional)',
      visibility: 'Visibilidad',
      public: 'Público',
      private: 'Privado',
      sessions: 'sesiones',
      days: 'días',
      sports: 'deportes',
      units: 'unidades',
      create: 'Crear Reto',
      creating: 'Creando...',
      error: 'Error al crear reto',
      success: '¡Reto creado!',
      requiredField: 'Este campo es obligatorio',
      dateRange: 'La fecha de fin debe ser posterior a la de inicio',
    },
  };

  const strings = t[language as keyof typeof t] || t.en;

  const sports = Object.keys(sportTranslations[language === 'es' ? 'es' : 'en'] || {});

  const getTargetLabel = () => {
    switch (form.challengeType) {
      case 'session_count':
        return strings.sessions;
      case 'streak':
        return strings.days;
      case 'sport_variety':
        return strings.sports;
      case 'custom':
        return strings.units;
      default:
        return '';
    }
  };

  useEffect(() => {
    const getCurrentUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/auth/login');
        return;
      }

      setCurrentUserId(user.id);
      setLoading(false);
    };

    getCurrentUser();
  }, [supabase, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.title.trim()) {
      alert(strings.requiredField);
      return;
    }

    if (new Date(form.endDate) <= new Date(form.startDate)) {
      alert(strings.dateRange);
      return;
    }

    if (!currentUserId) return;

    setSubmitting(true);
    try {
      const result = await createChallenge(supabase, {
        title: form.title,
        description: form.description || undefined,
        cover_image_url: form.coverImageUrl || undefined,
        challenge_type: form.challengeType,
        target_value: form.targetValue,
        start_date: new Date(form.startDate).toISOString(),
        end_date: new Date(form.endDate).toISOString(),
        creator_id: currentUserId,
        sport: form.sport || undefined,
        is_public: form.isPublic,
      });

      if (result.success && result.data) {
        router.push(`/challenges/${result.data.id}`);
      } else {
        alert(strings.error);
      }
    } catch (error) {
      console.error('Error creating challenge:', error);
      alert(strings.error);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <Loader className="h-8 w-8 animate-spin text-tribe-green" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-page pb-12">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-tribe-green hover:opacity-75 transition"
          >
            <ArrowLeft className="h-5 w-5" />
            {strings.back}
          </button>
          <h1 className="text-lg font-bold text-theme-primary flex-1 text-center">{strings.createChallenge}</h1>
          <div className="w-20"></div>
        </div>
      </div>

      {/* Form */}
      <div className="pt-header max-w-2xl mx-auto p-4">
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-tribe-dark rounded-2xl p-6 border border-stone-200 dark:border-gray-700 space-y-5"
        >
          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-theme-primary mb-2">{strings.title}</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={strings.title}
              className="w-full px-4 py-3 bg-stone-50 dark:bg-tribe-surface border border-stone-200 dark:border-gray-600 rounded-lg text-theme-primary placeholder-theme-secondary focus:outline-none focus:ring-2 focus:ring-tribe-green"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-theme-primary mb-2">{strings.description}</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={strings.description}
              rows={3}
              className="w-full px-4 py-3 bg-stone-50 dark:bg-tribe-surface border border-stone-200 dark:border-gray-600 rounded-lg text-theme-primary placeholder-theme-secondary focus:outline-none focus:ring-2 focus:ring-tribe-green resize-none"
            />
          </div>

          {/* Challenge Type */}
          <div>
            <label className="block text-sm font-semibold text-theme-primary mb-3">{strings.type}</label>
            <div className="grid grid-cols-2 gap-2">
              {CHALLENGE_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setForm({ ...form, challengeType: type.value })}
                  className={`px-4 py-3 rounded-lg font-semibold transition ${
                    form.challengeType === type.value
                      ? 'bg-tribe-green text-slate-900'
                      : 'bg-stone-100 dark:bg-tribe-surface text-theme-primary hover:bg-tribe-green/20'
                  }`}
                >
                  {language === 'es' ? type.labelEs : type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Target Value */}
          <div>
            <label className="block text-sm font-semibold text-theme-primary mb-2">
              {strings.targetValue} ({getTargetLabel()})
            </label>
            <input
              type="number"
              value={form.targetValue}
              onChange={(e) => setForm({ ...form, targetValue: Math.max(1, parseInt(e.target.value) || 1) })}
              min="1"
              className="w-full px-4 py-3 bg-stone-50 dark:bg-tribe-surface border border-stone-200 dark:border-gray-600 rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-tribe-green"
            />
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-theme-primary mb-2">{strings.startDate}</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full px-4 py-3 bg-stone-50 dark:bg-tribe-surface border border-stone-200 dark:border-gray-600 rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-tribe-green"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-theme-primary mb-2">{strings.endDate}</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full px-4 py-3 bg-stone-50 dark:bg-tribe-surface border border-stone-200 dark:border-gray-600 rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-tribe-green"
              />
            </div>
          </div>

          {/* Sport */}
          <div>
            <label className="block text-sm font-semibold text-theme-primary mb-2">{strings.sport}</label>
            <select
              value={form.sport}
              onChange={(e) => setForm({ ...form, sport: e.target.value })}
              className="w-full px-4 py-3 bg-stone-50 dark:bg-tribe-surface border border-stone-200 dark:border-gray-600 rounded-lg text-theme-primary focus:outline-none focus:ring-2 focus:ring-tribe-green"
            >
              <option value="">{language === 'es' ? 'Seleccionar deporte' : 'Select sport'}</option>
              {sports.map((sport) => (
                <option key={sport} value={sport}>
                  {(sportTranslations as Record<string, Record<string, string>>)[language === 'es' ? 'es' : 'en']?.[
                    sport
                  ] || sport}
                </option>
              ))}
            </select>
          </div>

          {/* Cover Image URL */}
          <div>
            <label className="block text-sm font-semibold text-theme-primary mb-2">{strings.coverImage}</label>
            <input
              type="url"
              value={form.coverImageUrl}
              onChange={(e) => setForm({ ...form, coverImageUrl: e.target.value })}
              placeholder="https://example.com/image.jpg"
              className="w-full px-4 py-3 bg-stone-50 dark:bg-tribe-surface border border-stone-200 dark:border-gray-600 rounded-lg text-theme-primary placeholder-theme-secondary focus:outline-none focus:ring-2 focus:ring-tribe-green"
            />
          </div>

          {/* Public/Private */}
          <div>
            <label className="block text-sm font-semibold text-theme-primary mb-3">{strings.visibility}</label>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setForm({ ...form, isPublic: true })}
                className={`flex-1 px-4 py-3 rounded-lg font-semibold transition ${
                  form.isPublic
                    ? 'bg-tribe-green text-slate-900'
                    : 'bg-stone-100 dark:bg-tribe-surface text-theme-primary hover:bg-tribe-green/20'
                }`}
              >
                {strings.public}
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, isPublic: false })}
                className={`flex-1 px-4 py-3 rounded-lg font-semibold transition ${
                  !form.isPublic
                    ? 'bg-tribe-green text-slate-900'
                    : 'bg-stone-100 dark:bg-tribe-surface text-theme-primary hover:bg-tribe-green/20'
                }`}
              >
                {strings.private}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-tribe-green text-slate-900 font-semibold rounded-lg px-6 py-3 hover:bg-tribe-green disabled:opacity-50 transition mt-6"
          >
            {submitting ? strings.creating : strings.create}
          </button>
        </form>
      </div>
    </div>
  );
}
