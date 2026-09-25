'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';
import LocationPicker from '@/components/LocationPicker';
import CommunityCoverPicker from '@/components/communities/CommunityCoverPicker';
import { createCommunity } from '@/lib/dal/communities';
import { setCommunityBanner } from '@/lib/dal/communityBanner';
import { compressImage } from '@/components/session/recapPhotosHelpers';
import { showError } from '@/lib/toast';
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
  coverFailed:
    language === 'es'
      ? 'La comunidad se creó, pero la portada no se pudo subir. Agrégala desde la página de la comunidad.'
      : 'Community created, but the cover image did not upload. Add it from the community page.',
});

// compressImage has no error path: a file the browser cannot decode never
// resolves. Here the community already exists when it runs, so a hang would
// strand the user on a spinner. Bound it and treat a timeout as a failed cover.
function compressCover(file: File): Promise<Blob> {
  return Promise.race([
    compressImage(file),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('cover compression timed out')), 15000)),
  ]);
}

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
  // T-COMM1: a picked cover is held here and uploaded only once the community
  // exists, into that community's own banner folder. Uploading on pick left a
  // file behind in profile-images for every re-pick and every abandoned form.
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (coverPreview) URL.revokeObjectURL(coverPreview);
    };
  }, [coverPreview]);

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
        // A picked file wins over a pasted URL; it is attached after the insert.
        cover_image_url: coverFile ? undefined : formData.cover_image_url || undefined,
        sport: formData.sport || undefined,
        location_lat: formData.location_lat || undefined,
        location_lng: formData.location_lng || undefined,
        location_name: formData.location_name || undefined,
        creator_id: userId!,
        is_private: formData.is_private,
      });

      if (!result.success || !result.data) {
        setErrors({ submit: result.error || t.error });
        setLoading(false);
        return;
      }

      const communityId = result.data;
      if (coverFile) {
        // The community already exists at this point, so a failed cover must
        // not undo it or block the redirect. Say so, and let them retry from
        // the community page.
        try {
          const cover = await setCommunityBanner(supabase, communityId, await compressCover(coverFile));
          if (!cover.success) throw new Error(cover.error ?? 'cover upload failed');
        } catch (coverError) {
          logError(coverError, { action: 'createCommunity.cover', communityId });
          showError(t.coverFailed);
        }
      }

      // Redirect to community page
      router.push(`/communities/${communityId}`);
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
      <div className="sticky top-0 safe-area-top bg-white dark:bg-tribe-surface border-b border-gray-200 dark:border-tribe-mid z-40">
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

          {/* Cover image: upload, or paste a hosted URL (BUG-021). */}
          <CommunityCoverPicker
            label={t.coverImage}
            hint={t.coverImageHint}
            previewUrl={coverPreview || formData.cover_image_url || null}
            urlValue={formData.cover_image_url}
            onPickFile={(file) => {
              setCoverFile(file);
              setCoverPreview(URL.createObjectURL(file));
              setFormData((prev) => ({ ...prev, cover_image_url: '' }));
            }}
            onUrlChange={(url) => {
              setCoverFile(null);
              setCoverPreview(null);
              setFormData((prev) => ({ ...prev, cover_image_url: url }));
            }}
          />

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
