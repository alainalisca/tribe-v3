'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Camera, Eye, Save, Loader } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { updateStorefrontProfile } from '@/lib/dal/instructorDashboard';
import { showSuccess, showError } from '@/lib/toast';
import VideoUploadSection from '@/components/dashboard/VideoUploadSection';
import { SPORTS_LIST, getSportTranslation } from '@/lib/sports';

/**
 * The sport chips, from the canonical SPORTS_LIST. `Other` is excluded: it is a
 * real stored value but meaningless as a filter, and an instructor who does
 * something outside the list has the specialties field for exactly that.
 */
const SPORT_CHOICES = SPORTS_LIST.filter((sport) => sport !== 'Other');

interface StorefrontEditorProps {
  userId: string;
  language: 'en' | 'es';
  /** users.instructor_bio. The one column this editor owns. */
  initialBio: string;
  /**
   * users.bio, READ ONLY. Used solely to explain the display fallback when the
   * storefront bio is empty. This component must never write it: see the
   * comment on handleSave.
   */
  initialShortBio?: string;
  initialTagline: string;
  initialSports: string[];
  initialSpecialties: string[];
  initialBannerUrl: string;
  initialVideoUrl?: string | null;
}

export default function StorefrontEditor({
  userId,
  language,
  initialBio,
  initialShortBio = '',
  initialTagline,
  initialSports,
  initialSpecialties,
  initialBannerUrl,
  initialVideoUrl = null,
}: StorefrontEditorProps) {
  const supabase = createClient();

  const [bio, setBio] = useState(initialBio);
  const [tagline, setTagline] = useState(initialTagline);
  const [sports, setSports] = useState<string[]>(initialSports);
  const [specialties, setSpecialties] = useState(initialSpecialties.join(', '));
  const [bannerUrl, setBannerUrl] = useState(initialBannerUrl);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const txt = {
    title: language === 'es' ? 'Editor de Vitrina' : 'Storefront Editor',
    // Issue 2: this said only "Bio" / "Biografía" while prefilling from
    // instructor_bio || bio and saving to instructor_bio. An instructor editing
    // "their bio" here silently moved text out of users.bio, which is what
    // /profile/[userId] and /search still display. The label now names the one
    // column this control owns.
    bio: language === 'es' ? 'Bio de tu vitrina' : 'Storefront bio',
    bioHint:
      language === 'es'
        ? 'La versión más larga, donde los atletas deciden reservar'
        : 'The longer version, where athletes decide to book',
    bioPlaceholder:
      language === 'es'
        ? 'Tu experiencia, tu enfoque, por qué alguien debería entrenar contigo'
        : 'Your experience, your approach, why someone should train with you',
    // Shown only when instructor_bio is empty and bio is not. The five display
    // paths still fall back to `instructor_bio || bio`, so the storefront shows
    // text while this box is blank. Saying so is honest; prefilling the box
    // with users.bio would copy one column into the other the moment they save.
    bioFallbackNote:
      language === 'es'
        ? 'Por ahora se muestra tu bio corta. Escribe una bio de tu vitrina para reemplazarla.'
        : 'Your short bio is showing here for now. Write a storefront bio to replace it.',
    tagline: language === 'es' ? 'Eslogan' : 'Tagline',
    taglinePlaceholder: language === 'es' ? 'Frase corta que te define' : 'Short phrase that defines you',
    sports: language === 'es' ? 'Deportes' : 'Sports',
    sportsHint: language === 'es' ? 'Por lo que la gente busca' : 'What people search by',
    specialties: language === 'es' ? 'Especialidades' : 'Specialties',
    specialtiesHint: language === 'es' ? 'Lo que te hace diferente' : 'What makes you different',
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
    // Names no sport, on purpose. This placeholder used to read
    // 'Yoga, HIIT, Crossfit' -- three sport names, one of them misspelled
    // against the canonical list -- and is where most of the free-text sport
    // names in production came from.
    specialtiesPlaceholder:
      language === 'es'
        ? 'Terapia de sonido, prenatal, preparación para competencia'
        : 'Sound healing, prenatal, competition prep',
  };

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Stable, per-user path (no timestamp, no extension): each re-upload
      // overwrites the same object via upsert, so an instructor keeps exactly
      // one banner instead of orphaning the previous file on every change.
      //
      // RLS: migration 057 grants this prefix a public SELECT ("Storefront
      // banners are publicly readable") plus INSERT/UPDATE/DELETE scoped to
      // storefront-banners/<auth.uid()>/... — DELETE is what lets upsert
      // replace the object (the 038/QA-12 lesson). Those policies match on the
      // folder segments only, not the filename, so dropping the timestamp keeps
      // them satisfied and the anonymous /storefront/[id] read still works.
      const path = `storefront-banners/${userId}/banner`;
      const { error: uploadError } = await supabase.storage.from('media').upload(path, file, {
        upsert: true,
        // With no extension in the key, Supabase cannot infer the type from the
        // path, so set it explicitly or the object is stored and served as
        // application/octet-stream. The bucket allowlist (migration 145) is
        // jpeg/png/webp/mp4; the file input already restricts to those images.
        contentType: file.type || 'image/jpeg',
      });

      if (uploadError) {
        // Surface the actual error so storage RLS / size / type problems are
        // diagnosable. Falls back to the generic message if Supabase didn't
        // give us anything useful.
        showError(uploadError.message || txt.uploadError);
        return;
      }

      const { data: urlData } = supabase.storage.from('media').getPublicUrl(path);
      // Cache-bust: the object now lives at a fixed URL, so without a changing
      // query string the browser and CDN would keep serving the previous banner
      // after an overwrite. ?v=<timestamp> forces a fresh fetch, and storing it
      // means every surface reading cover_image_url gets the current image.
      setBannerUrl(`${urlData.publicUrl}?v=${Date.now()}`);
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

    // instructor_bio ONLY. Writing `bio` here as well was the tempting option
    // and the destructive one: this editor used to prefill from
    // `instructor_bio || bio`, which for the instructor whose bio is English
    // and whose instructor_bio is Spanish resolves to the Spanish, so her
    // first storefront save would have overwritten her English bio -- silently,
    // with text still in the field. Three of ten instructors use the pair as
    // two genuinely different texts. One control, one column.
    const result = await updateStorefrontProfile(supabase, userId, {
      instructor_bio: bio,
      storefront_tagline: tagline,
      sports,
      specialties: specialtiesArr,
      cover_image_url: bannerUrl || null,
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
      {/* Preview and its control are ONE child of the space-y-6 stack, so the
          gap between them is the label's own mt-3 rather than the stack's
          24px. As two siblings they would both take space-y-6's margin-top and
          the control would drift away from the thing it acts on. */}
      <div>
        {/* T-AUD14: THE UPLOAD CONTROL SITS BELOW THE PREVIEW, NOT INSIDE IT.
          It used to be `absolute bottom-3 right-3` within this box, over a
          vertically centred text column. The two overlapped by 12 of the hint's
          16 pixels AT EVERY VIEWPORT WIDTH, because neither position depends on
          width: the column's 88px of content centres in the 160px box at y
          36-124, and the button's 36px height at bottom-3 puts its top edge at
          y 112. Horizontally they met on anything narrower than roughly 620px,
          so every phone. The instructor never saw "1200x400 recommended".

          The fix is not padding the column to clear the button. Padding would
          keep a control inside a centred text block and rely on arithmetic to
          keep them apart -- and the arithmetic was never done, which is the
          only reason this shipped. Moving the control out removes the class of
          bug rather than this instance of it. */}
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
        </div>

        <label
          className={`mt-3 flex items-center justify-center gap-2 w-full px-3 py-3 rounded-xl cursor-pointer transition text-sm font-semibold ${
            bannerUrl
              ? 'bg-theme-card border border-theme text-theme-primary hover:bg-theme-page'
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

      {/* Storefront bio -> users.instructor_bio, and nothing else. */}
      <div>
        <label className="block text-sm font-medium text-theme-secondary mb-1">
          {txt.bio} <span className="text-xs text-muted-foreground">({txt.bioHint})</span>
        </label>
        {bio.trim().length === 0 && initialShortBio.trim().length > 0 && (
          <p className="text-xs text-muted-foreground mb-2">{txt.bioFallbackNote}</p>
        )}
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder={txt.bioPlaceholder}
          rows={4}
          maxLength={1000}
          className="w-full px-4 py-3 rounded-xl bg-white dark:bg-tribe-surface border border-stone-200 dark:border-tribe-mid text-theme-primary focus:ring-2 focus:ring-tribe-green focus:border-transparent outline-none resize-none"
        />
      </div>

      {/* Sports: the canonical vocabulary, written to users.sports */}
      <div>
        <label className="block text-sm font-medium text-theme-secondary mb-1">
          {txt.sports} <span className="text-xs text-muted-foreground">({txt.sportsHint})</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {SPORT_CHOICES.map((sport) => (
            <button
              key={sport}
              type="button"
              onClick={() =>
                setSports((prev) => (prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport]))
              }
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                sports.includes(sport)
                  ? 'bg-tribe-green text-slate-900 font-semibold'
                  : 'bg-stone-100 dark:bg-tribe-surface text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-tribe-mid'
              }`}
            >
              {getSportTranslation(sport, language)}
            </button>
          ))}
        </div>
      </div>

      {/* Specialties: free text, written to users.specialties */}
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

      {/* Intro Video */}
      <VideoUploadSection supabase={supabase} userId={userId} initialVideoUrl={initialVideoUrl} />

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
