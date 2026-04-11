'use client';

import { useState } from 'react';
import Link from 'next/link';
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
    preview: language === 'es' ? 'Ver Vitrina' : 'Preview Storefront',
    save: language === 'es' ? 'Guardar Cambios' : 'Save Changes',
    saved: language === 'es' ? 'Guardado' : 'Saved!',
    saveError: language === 'es' ? 'Error al guardar' : 'Failed to save',
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
        showError(txt.saveError);
        return;
      }

      const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
      setBannerUrl(urlData.publicUrl);
    } catch {
      showError(txt.saveError);
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
      {/* Banner Preview */}
      <div className="relative h-40 rounded-xl overflow-hidden bg-gradient-to-br from-tribe-green to-lime-500">
        {bannerUrl && <img src={bannerUrl} alt="Banner" className="w-full h-full object-cover" />}
        <label className="absolute bottom-3 right-3 flex items-center gap-2 bg-black/60 text-white px-3 py-2 rounded-lg cursor-pointer hover:bg-black/80 transition text-sm">
          {uploading ? <Loader className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          {txt.changeBanner}
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
          className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#3D4349] border border-stone-200 dark:border-[#52575D] text-theme-primary focus:ring-2 focus:ring-tribe-green focus:border-transparent outline-none"
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
          className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#3D4349] border border-stone-200 dark:border-[#52575D] text-theme-primary focus:ring-2 focus:ring-tribe-green focus:border-transparent outline-none resize-none"
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
          placeholder="Yoga, HIIT, Boxing"
          className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#3D4349] border border-stone-200 dark:border-[#52575D] text-theme-primary focus:ring-2 focus:ring-tribe-green focus:border-transparent outline-none"
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
