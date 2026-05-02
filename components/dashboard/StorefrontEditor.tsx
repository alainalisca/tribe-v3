'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Camera, Eye, Save, Loader } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { updateStorefrontProfile } from '@/lib/dal/instructorDashboard';
import { showSuccess, showError } from '@/lib/toast';

interface StorefrontEditorProps {
  userId: string;
  language: 'en' | 'es';
  initialBio: string;
  initialTagline: string;
  initialSpecialties: string[];
  initialBannerUrl: string;
}

export default function StorefrontEditor({
  userId,
  language,
  initialBio,
  initialTagline,
  initialSpecialties,
  initialBannerUrl,
}: StorefrontEditorProps) {
  const supabase = createClient();

  const [bio, setBio] = useState(initialBio);
  const [tagline, setTagline] = useState(initialTagline);
  const [specialties, setSpecialties] = useState(initialSpecialties.join(', '));
  const [bannerUrl, setBannerUrl] = useState(initialBannerUrl);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const txt = {
    title: language === 'es' ? 'Editor de Vitrina' : 'Storefront Editor',
    bio: language === 'es' ? 'Biografia' : 'Bio',
    bioPlaceholder: language === 'es' ? 'Describe tu experiencia...' : 'Describe your experience...',
    tagline: language === 'es' ? 'Eslogan' : 'Tagline',
    taglinePlaceholder: language === 'es' ? 'Frase corta que te define' : 'Short phrase that defines you',
    specialties: language === 'es' ? 'Especialidades' : 'Specialties',
    specialtiesHint: language === 'es' ? 'Separadas por coma' : 'Comma separated',
    banner: language === 'es' ? 'Foto de Portada' : 'Banner Photo',
    changeBanner: language === 'es' ? 'Cambiar Portada' : 'Change Banner',
    uploadBanner: language === 'es' ? 'Sube tu foto de portada' : 'Upload your banner photo',
    bannerHint: language === 'es' ? '1200×400 recomendado · JPG, PNG, WebP' : '1200×400 recommended · JPG, PNG, WebP',
    preview: language === 'es' ? 'Ver Vitrina' : 'Preview Storefront',
    save: language === 'es' ? 'Guardar Cambios' : 'Save Changes',
    saved: language === 'es' ? 'Guardado' : 'Saved!',
    saveError: language === 'es' ? 'Error al guardar' : 'Failed to save',
    uploadError:
      language === 'es' ? 'No pudimos subir la imagen. Intenta de nuevo.' : "Couldn't upload image. Please try again.",
    specialtiesPlaceholder: language === 'es' ? 'Yoga, HIIT, Crossfit' : 'Yoga, HIIT, Boxing',
  };

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `storefront-banners/${userId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('media').upload(path, file, { upsert: true });

      if (uploadError) {
        // Surface the actual error so storage RLS / size / type problems are
        // diagnosable. Falls back to the generic message if Supabase didn't
        // give us anything useful.
        showError(uploadError.message || txt.uploadError);
        return;
      }

      const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
      setBannerUrl(urlData.publicUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : txt.uploadError;
      showError(message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    const specialtiesArr = specialties
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const result = await updateStorefrontProfile(supabase, userId, {
      instructor_bio: bio,
      storefront_tagline: tagline,
      specialties: specialtiesArr,
      storefront_banner_url: bannerUrl || null,
    });

    if (result.success) {
      showSuccess(txt.saved);
    } else {
      showError(result.error || txt.saveError);
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      {/* Banner Preview — neutral placeholder when empty, image fill when set. */}
      <div className="relative h-40 rounded-xl overflow-hidden bg-stone-100 dark:bg-tribe-surface border border-dashed border-stone-300 dark:border-tribe-mid">
        {bannerUrl ? (
          <Image src={bannerUrl} alt="Storefront banner" fill className="object-cover" unoptimized />
        ) : (
          <>
            {/* Subtle radial accent so the empty state doesn't read as broken. */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(circle at 50% 50%, rgba(132,204,22,0.08) 0%, transparent 60%)',
              }}
            />
            <div className="relative z-0 h-full flex flex-col items-center justify-center text-center px-6 gap-1">
              <div className="w-10 h-10 rounded-full bg-tribe-green/15 border border-tribe-green/30 flex items-center justify-center mb-1">
                <Camera className="w-5 h-5 text-tribe-green" />
              </div>
              <p className="text-sm font-semibold text-theme-primary">{txt.uploadBanner}</p>
              <p className="text-xs text-theme-secondary">{txt.bannerHint}</p>
            </div>
          </>
        )}
        <label
          className={`absolute bottom-3 right-3 flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition text-sm font-semibold ${
            bannerUrl
              ? 'bg-black/60 text-white hover:bg-black/80'
              : 'bg-tribe-green text-tribe-dark hover:bg-tribe-green-hover'
          }`}
        >
          {uploading ? <Loader className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          {bannerUrl ? txt.changeBanner : txt.uploadBanner}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleBannerUpload}
            disabled={uploading}
          />
        </label>
      </div>

      {/* Tagline */}
      <div>
        <label className="block text-sm font-medium text-theme-secondary mb-1">{txt.tagline}</label>
        <input
          type="text"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder={txt.taglinePlaceholder}
          maxLength={120}
          className="w-full px-4 py-3 rounded-xl bg-white dark:bg-tribe-surface border border-stone-200 dark:border-tribe-mid text-theme-primary focus:ring-2 focus:ring-tribe-green focus:border-transparent outline-none"
        />
      </div>

      {/* Bio */}
      <div>
        <label className="block text-sm font-medium text-theme-secondary mb-1">{txt.bio}</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder={txt.bioPlaceholder}
          rows={4}
          maxLength={1000}
          className="w-full px-4 py-3 rounded-xl bg-white dark:bg-tribe-surface border border-stone-200 dark:border-tribe-mid text-theme-primary focus:ring-2 focus:ring-tribe-green focus:border-transparent outline-none resize-none"
        />
      </div>

      {/* Specialties */}
      <div>
        <label className="block text-sm font-medium text-theme-secondary mb-1">
          {txt.specialties} <span className="text-xs text-muted-foreground">({txt.specialtiesHint})</span>
        </label>
        <input
          type="text"
          value={specialties}
          onChange={(e) => setSpecialties(e.target.value)}
          placeholder={txt.specialtiesPlaceholder}
          className="w-full px-4 py-3 rounded-xl bg-white dark:bg-tribe-surface border border-stone-200 dark:border-tribe-mid text-theme-primary focus:ring-2 focus:ring-tribe-green focus:border-transparent outline-none"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving} className="flex-1 py-3 font-semibold">
          {saving ? <Loader className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          {txt.save}
        </Button>
        <Link href={`/storefront/${userId}`}>
          <Button variant="outline" className="py-3">
            <Eye className="w-4 h-4 mr-2" />
            {txt.preview}
          </Button>
        </Link>
      </div>
    </div>
  );
}
