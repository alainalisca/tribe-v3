'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';
import LocationPicker from '@/components/LocationPicker';
import { createCommunity } from '@/lib/dal/communities';
import { sportTranslations } from '@/lib/translations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ChevronLeft } from 'lucide-react';

const getTranslations = (language: 'en' | 'es') => ({
  title: language === 'es' ? 'Crear Comunidad' : 'Create Community',
  backButton: language === 'es' ? 'Volver' : 'Back',
  name: language === 'es' ? 'Nombre' : 'Name',
  namePlaceholder: language === 'es' ? 'Ej: Runners de Medellín' : 'E.g.: Medellin Runners',
  description: language === 'es' ? 'Descripción' : 'Description',
  descriptionPlaceholder: language === 'es' ? 'Cuéntanos sobre tu comunidad...' : 'Tell us about your community...',
  sport: language === 'es' ? 'Deporte' : 'Sport',
  sportHint: language === 'es' ? 'Opcional - Selecciona un deporte' : 'Optional - Select a sport',
  coverImage: language === 'es' ? 'URL de Imagen de Portada' : 'Cover Image URL',
  coverImageHint: language === 'es' ? 'Opcional - Enlace a una imagen' : 'Optional - Link to an image',
  location: language === 'es' ? 'Ubicación' : 'Location',
  isPrivate: language === 'es' ? 'Comunidad Privada' : 'Private Community',
  isPrivateDesc: language === 'es' ? 'Solo miembros invitados pueden unirse' : 'Only invited members can join',
  create: language === 'es' ? 'Crear' : 'Create',
  creating: language === 'es' ? 'Creando...' : 'Creating...',
  error: language === 'es' ? 'Error al crear comunidad' : 'Error creating community',
  success: language === 'es' ? 'Comunidad creada' : 'Community created',
  required: language === 'es' ? 'Campo requerido' : 'Field required',
});

export default function CreateCommunityPage() {
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const t = getTranslations(language);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sport: '',
    cover_image_url: '',
    location_name: '',
    location_lat: null as number | null,
    location_lng: null as number | null,
    is_private: false,
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth');
        return;
      }
      setUserId(user.id);
    }
    getUser();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validate
    const newErrors: { [key: string]: string } = {};
    if (!formData.name.trim()) newErrors.name = t.required;
    if (!userId) newErrors.userId = 'User not found';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);
    try {
      const result = await createCommunity(supabase, {
        name: formData.name,
        description: formData.description || undefined,
        cover_image_url: formData.cover_image_url || undefined,
        sport: formData.sport || undefined,
        location_lat: formData.location_lat || undefined,
        location_lng: formData.location_lng || undefined,
        location_name: formData.location_name || undefined,
        creator_id: userId!,
        is_private: formData.is_private,
      });

      if (!result.success) {
        setErrors({ submit: result.error || t.error });
        setLoading(false);
        return;
      }

      // Redirect to community page
      router.push(`/communities/${result.data}`);
    } catch (error) {
      logError(error, { action: 'createCommunity' });
      setErrors({ submit: t.error });
      setLoading(false);
    }
  }

  const sportOptions = Object.entries(sportTranslations)
    .filter(([key]) => key !== 'All')
    .map(([key, value]) => ({
      key,
      label: value[language],
    }));

  return (
    <div className="min-h-screen bg-white dark:bg-tribe-surface">
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-tribe-surface border-b border-gray-200 dark:border-tribe-mid z-40">
        <div className="max-w-2xl md:max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-stone-100 dark:hover:bg-tribe-mid rounded-lg transition"
          >
            <ChevronLeft className="w-6 h-6 text-theme-primary" />
          </button>
          <h1 className="text-2xl font-bold text-theme-primary">{t.title}</h1>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-2xl md:max-w-4xl mx-auto px-4 py-8 pb-24">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-theme-primary">{t.name}</label>
            <input
              type="text"
              placeholder={t.namePlaceholder}
              value={formData.name}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                setErrors({ ...errors, name: '' });
              }}
              className="w-full px-4 py-3 bg-stone-100 dark:bg-tribe-mid rounded-lg border border-stone-200 dark:border-tribe-card text-theme-primary placeholder-stone-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-tribe-green focus:border-transparent"
            />
            {errors.name && <p className="text-red-500 text-sm">{errors.name}</p>}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-theme-primary">{t.description}</label>
            <textarea
              placeholder={t.descriptionPlaceholder}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="w-full px-4 py-3 bg-stone-100 dark:bg-tribe-mid rounded-lg border border-stone-200 dark:border-tribe-card text-theme-primary placeholder-stone-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-tribe-green focus:border-transparent resize-none"
            />
          </div>

          {/* Sport */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-theme-primary">{t.sport}</label>
            <p className="text-xs text-stone-500 dark:text-gray-400">{t.sportHint}</p>
            <select
              value={formData.sport}
              onChange={(e) => setFormData({ ...formData, sport: e.target.value })}
              className="w-full px-4 py-3 bg-stone-100 dark:bg-tribe-mid rounded-lg border border-stone-200 dark:border-tribe-card text-theme-primary focus:outline-none focus:ring-2 focus:ring-tribe-green focus:border-transparent"
            >
              <option value="">-- {language === 'es' ? 'Ninguno' : 'None'} --</option>
              {sportOptions.map((sport) => (
                <option key={sport.key} value={sport.key}>
                  {sport.label}
                </option>
              ))}
            </select>
          </div>

          {/* Cover Image — upload (with URL fallback for already-set images) */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-theme-primary">{t.coverImage}</label>
            <p className="text-xs text-stone-500 dark:text-gray-400">{t.coverImageHint}</p>
            <div className="flex items-center gap-3">
              <input
                id="community-cover-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={async (e) => {
                  // BUG-021: replaced the URL-only input with a real upload.
                  // Falls back to the URL input below for already-hosted images.
                  const file = e.target.files?.[0];
                  if (!file || !userId) return;
                  const path = `community-covers/${userId}-${Date.now()}.${file.name.split('.').pop()}`;
                  const { error: upErr } = await supabase.storage
                    .from('profile-images')
                    .upload(path, file, { contentType: file.type, upsert: true });
                  if (upErr) {
                    logError(upErr, { action: 'communityCoverUpload' });
                    return;
                  }
                  const {
                    data: { publicUrl },
                  } = supabase.storage.from('profile-images').getPublicUrl(path);
                  setFormData((prev) => ({ ...prev, cover_image_url: publicUrl }));
                }}
              />
              <label
                htmlFor="community-cover-upload"
                className="px-4 py-2 bg-tribe-green text-slate-900 rounded-lg font-semibold text-sm cursor-pointer hover:bg-lime-500 transition"
              >
                {language === 'es' ? 'Subir imagen' : 'Upload image'}
              </label>
              {formData.cover_image_url && (
                <img
                  src={formData.cover_image_url}
                  alt=""
                  className="w-12 h-12 rounded-lg object-cover border border-stone-200 dark:border-tribe-card"
                />
              )}
            </div>
            <input
              type="url"
              placeholder={language === 'es' ? 'O pega una URL de imagen' : 'Or paste an image URL'}
              value={formData.cover_image_url}
              onChange={(e) => setFormData({ ...formData, cover_image_url: e.target.value })}
              className="w-full px-4 py-3 bg-stone-100 dark:bg-tribe-mid rounded-lg border border-stone-200 dark:border-tribe-card text-theme-primary placeholder-stone-400 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-tribe-green focus:border-transparent text-sm"
            />
          </div>

          {/* Location */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-theme-primary">{t.location}</label>
            <LocationPicker
              value={formData.location_name}
              onChange={(location) => setFormData({ ...formData, location_name: location })}
              placeholder={language === 'es' ? 'Buscar ubicación...' : 'Search location...'}
            />
          </div>

          {/* Private toggle */}
          <div className="space-y-3 bg-stone-50 dark:bg-tribe-surface p-4 rounded-lg">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_private}
                onChange={(e) => setFormData({ ...formData, is_private: e.target.checked })}
                className="w-5 h-5 rounded accent-tribe-green"
              />
              <span className="font-medium text-theme-primary">{t.isPrivate}</span>
            </label>
            <p className="text-xs text-stone-600 dark:text-gray-400 ml-8">{t.isPrivateDesc}</p>
          </div>

          {/* Error message */}
          {errors.submit && <p className="text-red-500 text-sm">{errors.submit}</p>}

          {/* Submit button */}
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-tribe-green hover:bg-tribe-green text-slate-900 font-semibold h-12 rounded-lg transition"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                {t.creating}
              </>
            ) : (
              t.create
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
