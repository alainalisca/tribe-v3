/** Page: /onboarding/instructor — Guided instructor setup with profile + storefront + monetization */
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';
import { showSuccess, showError } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';
import { fetchUserProfile, updateUser } from '@/lib/dal';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Upload,
  X,
  User,
  Store,
  DollarSign,
  Sparkles,
  Camera,
  Star,
  Zap,
  Tag,
  Megaphone,
  TrendingUp,
} from 'lucide-react';

const SPORTS_LIST = [
  'Yoga',
  'CrossFit',
  'Running',
  'Cycling',
  'Swimming',
  'Boxing',
  'Pilates',
  'Functional Training',
  'HIIT',
  'Strength Training',
  'Dance',
  'Martial Arts',
  'Tennis',
  'Basketball',
  'Soccer',
  'Volleyball',
  'Calisthenics',
  'Stretching',
  'Meditation',
  'Other',
];

const getTranslations = (language: 'en' | 'es') => ({
  // Step labels
  step1Label: language === 'es' ? 'Tu Perfil' : 'Your Profile',
  step2Label: language === 'es' ? 'Tu Vitrina' : 'Your Storefront',
  step3Label: language === 'es' ? 'Monetización' : 'Monetization',
  // Step 1
  step1Title: language === 'es' ? 'Cuéntanos sobre ti' : 'Tell us about yourself',
  step1Subtitle:
    language === 'es'
      ? 'Esta información aparecerá en tu perfil público y vitrina'
      : 'This info appears on your public profile and storefront',
  name: language === 'es' ? 'Nombre completo' : 'Full name',
  bio: language === 'es' ? 'Sobre ti (bio)' : 'About you (bio)',
  bioPlaceholder: language === 'es' ? 'Cuéntale a tu comunidad quién eres...' : 'Tell your community who you are...',
  professionalBio: language === 'es' ? 'Bio profesional' : 'Professional bio',
  profBioPlaceholder:
    language === 'es'
      ? 'Tu experiencia, enfoque de entrenamiento, qué te hace único...'
      : 'Your experience, training approach, what makes you unique...',
  specialties: language === 'es' ? 'Especialidades' : 'Specialties',
  customSpecialtyPlaceholder:
    language === 'es'
      ? 'Agregar otras especialidades separadas por coma...'
      : 'Add other specialties, comma-separated...',
  certifications: language === 'es' ? 'Certificaciones' : 'Certifications',
  certPlaceholder: language === 'es' ? 'Ej: ACE, NASM, Yoga Alliance...' : 'E.g. ACE, NASM, Yoga Alliance...',
  yearsExperience: language === 'es' ? 'Años de experiencia' : 'Years of experience',
  website: language === 'es' ? 'Sitio web (opcional)' : 'Website (optional)',
  profilePhoto: language === 'es' ? 'Foto de perfil' : 'Profile photo',
  uploadPhoto: language === 'es' ? 'Subir foto' : 'Upload photo',
  // Step 2
  step2Title: language === 'es' ? 'Configura tu vitrina' : 'Set up your storefront',
  step2Subtitle:
    language === 'es'
      ? 'Tu vitrina es tu página pública donde los atletas te encuentran y reservan'
      : 'Your storefront is your public page where athletes find you and book',
  tagline: language === 'es' ? 'Eslogan' : 'Tagline',
  taglinePlaceholder:
    language === 'es'
      ? 'Ej: Transforma tu cuerpo, transforma tu vida'
      : 'E.g. Transform your body, transform your life',
  taglineHint:
    language === 'es' ? 'Aparece debajo de tu nombre (máx. 100 caracteres)' : 'Shows below your name (max 100 chars)',
  bannerUrl: language === 'es' ? 'URL de imagen de banner (opcional)' : 'Banner image URL (optional)',
  storefrontPreview: language === 'es' ? 'Vista previa de tu vitrina' : 'Your storefront preview',
  previewNote:
    language === 'es'
      ? 'Así se verá tu vitrina en /storefront/tu-id'
      : 'This is how your storefront looks at /storefront/your-id',
  // Step 3
  step3Title: language === 'es' ? 'Herramientas para ganar' : 'Tools to earn',
  step3Subtitle:
    language === 'es'
      ? 'Tribe te da todo lo que necesitas para monetizar tu conocimiento'
      : 'Tribe gives you everything you need to monetize your expertise',
  earningsCurrency: language === 'es' ? 'Moneda de ganancias' : 'Earnings currency',
  featurePaidSessions: language === 'es' ? 'Sesiones Pagadas' : 'Paid Sessions',
  featurePaidSessionsDesc:
    language === 'es'
      ? 'Cobra por tus sesiones. Los pagos van directo a ti.'
      : 'Charge for your sessions. Payments go directly to you.',
  featurePromoCodes: language === 'es' ? 'Códigos Promocionales' : 'Promo Codes',
  featurePromoCodesDesc:
    language === 'es' ? 'Crea descuentos para atraer nuevos atletas.' : 'Create discounts to attract new athletes.',
  featureBoosts: language === 'es' ? 'Campañas de Boost' : 'Boost Campaigns',
  featureBoostsDesc:
    language === 'es'
      ? 'Paga para aparecer primero en la página de descubrimiento.'
      : 'Pay to appear first on the discovery page.',
  featureAnnouncements: language === 'es' ? 'Anuncios' : 'Announcements',
  featureAnnouncementsDesc:
    language === 'es' ? 'Publica actualizaciones para tus seguidores.' : 'Post updates to your followers.',
  readyNote:
    language === 'es'
      ? 'Encontrarás todas estas herramientas en tu Hub de Promoción después de completar tu perfil.'
      : "You'll find all these tools in your Promote Hub after completing your profile.",
  // Navigation
  back: language === 'es' ? 'Atrás' : 'Back',
  next: language === 'es' ? 'Siguiente' : 'Next',
  finish: language === 'es' ? 'Completar Perfil' : 'Complete Profile',
  saving: language === 'es' ? 'Guardando...' : 'Saving...',
  profileComplete: language === 'es' ? '¡Perfil completo!' : 'Profile complete!',
});

export default function InstructorOnboardingPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const t = getTranslations(language);
  const supabase = createClient();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Form state
  const [customSpecialty, setCustomSpecialty] = useState('');

  const [form, setForm] = useState({
    name: '',
    bio: '',
    instructor_bio: '',
    specialties: [] as string[],
    certifications: '',
    years_experience: '' as string,
    website_url: '',
    storefront_tagline: '',
    storefront_banner_url: '',
    earnings_currency: 'COP',
    photos: [] as string[],
  });

  useEffect(() => {
    loadExistingData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadExistingData() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/auth');
        return;
      }
      setUserId(user.id);
      setAvatarUrl(user.user_metadata?.avatar_url || null);

      const profileResult = await fetchUserProfile(supabase, user.id);
      if (profileResult.data) {
        const p = profileResult.data;
        setForm({
          name: p.name || user.user_metadata?.full_name || '',
          bio: p.bio || '',
          instructor_bio: p.instructor_bio || '',
          specialties: p.specialties || [],
          certifications: (p.certifications || []).join(', '),
          years_experience: p.years_experience?.toString() || '',
          website_url: p.website_url || '',
          storefront_tagline: p.storefront_tagline || '',
          storefront_banner_url: p.storefront_banner_url || '',
          earnings_currency: p.earnings_currency || 'COP',
          photos: p.photos || [],
        });
        if (p.avatar_url) setAvatarUrl(p.avatar_url);
      }
    } catch (err) {
      logError(err, { action: 'instructorOnboarding.loadExistingData' });
    } finally {
      setLoading(false);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showError(language === 'es' ? 'Tipo de archivo no válido' : 'Invalid file type');
      return;
    }

    try {
      setUploadingPhoto(true);
      const ext = file.name.split('.').pop();
      const path = `photos/avatar-${userId}-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('profile-images').upload(path, file);
      if (uploadErr) throw uploadErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from('profile-images').getPublicUrl(path);

      setAvatarUrl(publicUrl);
      setForm((prev) => ({ ...prev, photos: [publicUrl, ...prev.photos].slice(0, 6) }));
    } catch (err) {
      logError(err, { action: 'instructorOnboarding.photoUpload' });
      showError(getErrorMessage(err, 'upload_photo', language));
    } finally {
      setUploadingPhoto(false);
    }
  }

  function toggleSpecialty(sport: string) {
    setForm((prev) => ({
      ...prev,
      specialties: prev.specialties.includes(sport)
        ? prev.specialties.filter((s) => s !== sport)
        : [...prev.specialties, sport],
    }));
  }

  function handleCustomSpecialtyKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addCustomSpecialties();
    }
  }

  function addCustomSpecialties() {
    const newSpecialties = customSpecialty
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !form.specialties.includes(s));
    if (newSpecialties.length > 0) {
      setForm((prev) => ({
        ...prev,
        specialties: [...prev.specialties, ...newSpecialties],
      }));
    }
    setCustomSpecialty('');
  }

  async function handleFinish() {
    if (!userId || saving) return;
    setSaving(true);

    try {
      const certsArray = form.certifications
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);

      const updatePayload: Record<string, unknown> = {
        name: form.name,
        bio: form.bio,
        is_instructor: true,
        instructor_since: new Date().toISOString(), // Trial period starts now
        instructor_bio: form.instructor_bio || null,
        specialties: form.specialties,
        certifications: certsArray,
        years_experience: form.years_experience ? parseInt(form.years_experience) : null,
        website_url: form.website_url || null,
        storefront_tagline: form.storefront_tagline || null,
        storefront_banner_url: form.storefront_banner_url || null,
        earnings_currency: form.earnings_currency,
        photos: form.photos,
      };

      if (avatarUrl) {
        updatePayload.avatar_url = avatarUrl;
      }

      const result = await updateUser(supabase, userId, updatePayload);
      if (!result.success) throw new Error(result.error);

      showSuccess(t.profileComplete);

      // Instructors land on their storefront so they see the result
      router.push(`/storefront/${userId}`);
    } catch (err) {
      logError(err, { action: 'instructorOnboarding.handleFinish' });
      showError(getErrorMessage(err, 'update_profile', language));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] flex items-center justify-center">
        <LoadingSpinner className="flex justify-center" />
      </div>
    );
  }

  const steps = [
    { num: 1, label: t.step1Label, icon: User },
    { num: 2, label: t.step2Label, icon: Store },
    { num: 3, label: t.step3Label, icon: DollarSign },
  ];

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D]">
      <div className="max-w-lg mx-auto p-4 pb-32">
        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-1 py-6">
          {steps.map((s, idx) => (
            <div key={s.num} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                    step > s.num
                      ? 'bg-tribe-green text-slate-900'
                      : step === s.num
                        ? 'bg-tribe-green text-slate-900 ring-4 ring-tribe-green/30'
                        : 'bg-stone-200 dark:bg-gray-600 text-stone-500 dark:text-gray-400'
                  }`}
                >
                  {step > s.num ? <Check className="w-5 h-5" /> : s.num}
                </div>
                <span
                  className={`text-[10px] mt-1 font-medium ${
                    step >= s.num ? 'text-tribe-green' : 'text-stone-400 dark:text-gray-500'
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`w-16 h-0.5 mx-2 mb-4 transition ${
                    step > s.num ? 'bg-tribe-green' : 'bg-stone-200 dark:bg-gray-600'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Profile */}
        {step === 1 && (
          <div className="space-y-5 animate-in fade-in duration-300">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white">{t.step1Title}</h2>
              <p className="text-sm text-stone-500 dark:text-gray-400 mt-1">{t.step1Subtitle}</p>
            </div>

            {/* Photo */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <Avatar className="w-24 h-24 border-3 border-tribe-green">
                  <AvatarImage src={avatarUrl || undefined} />
                  <AvatarFallback className="bg-tribe-green text-2xl font-bold text-slate-900">
                    {form.name ? form.name[0]?.toUpperCase() : '?'}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="absolute -bottom-1 -right-1 w-8 h-8 bg-tribe-green text-slate-900 rounded-full flex items-center justify-center shadow-md hover:bg-[#8FD642]"
                >
                  {uploadingPhoto ? <LoadingSpinner className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                </button>
              </div>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>

            {/* Name */}
            <div>
              <Label className="text-xs text-stone-600 dark:text-gray-400 mb-1 block">{t.name}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="bg-white dark:bg-[#52575D] border-stone-300 dark:border-gray-600"
              />
            </div>

            {/* Bio */}
            <div>
              <Label className="text-xs text-stone-600 dark:text-gray-400 mb-1 block">{t.bio}</Label>
              <textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                placeholder={t.bioPlaceholder}
                rows={2}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-[#52575D] border border-stone-300 dark:border-gray-600 rounded-lg text-stone-900 dark:text-white placeholder-stone-400 dark:placeholder-gray-500 focus-visible:ring-2 focus-visible:ring-tribe-green resize-none"
              />
            </div>

            {/* Professional Bio */}
            <div>
              <Label className="text-xs text-stone-600 dark:text-gray-400 mb-1 block">{t.professionalBio}</Label>
              <textarea
                value={form.instructor_bio}
                onChange={(e) => setForm({ ...form, instructor_bio: e.target.value })}
                placeholder={t.profBioPlaceholder}
                rows={3}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-[#52575D] border border-stone-300 dark:border-gray-600 rounded-lg text-stone-900 dark:text-white placeholder-stone-400 dark:placeholder-gray-500 focus-visible:ring-2 focus-visible:ring-tribe-green resize-none"
              />
            </div>

            {/* Specialties */}
            <div>
              <Label className="text-xs text-stone-600 dark:text-gray-400 mb-2 block">{t.specialties}</Label>
              <div className="flex flex-wrap gap-2">
                {SPORTS_LIST.map((sport) => (
                  <button
                    key={sport}
                    onClick={() => toggleSpecialty(sport)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                      form.specialties.includes(sport)
                        ? 'bg-tribe-green text-slate-900'
                        : 'bg-stone-100 dark:bg-[#3D4349] text-stone-600 dark:text-gray-400 hover:bg-stone-200'
                    }`}
                  >
                    {sport}
                  </button>
                ))}
              </div>
              {/* Custom specialties as removable tags */}
              {form.specialties.filter((s) => !SPORTS_LIST.includes(s)).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {form.specialties
                    .filter((s) => !SPORTS_LIST.includes(s))
                    .map((s) => (
                      <span
                        key={s}
                        className="px-3 py-1 rounded-full text-xs font-medium bg-tribe-green text-slate-900 flex items-center gap-1"
                      >
                        {s}
                        <button type="button" onClick={() => toggleSpecialty(s)} className="ml-0.5 hover:text-red-700">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                </div>
              )}
              {/* Custom specialty input */}
              <Input
                value={customSpecialty}
                onChange={(e) => setCustomSpecialty(e.target.value)}
                onKeyDown={handleCustomSpecialtyKeyDown}
                onBlur={addCustomSpecialties}
                placeholder={t.customSpecialtyPlaceholder}
                className="mt-2 bg-white dark:bg-[#52575D] border-stone-300 dark:border-gray-600"
              />
            </div>

            {/* Certifications */}
            <div>
              <Label className="text-xs text-stone-600 dark:text-gray-400 mb-1 block">{t.certifications}</Label>
              <Input
                value={form.certifications}
                onChange={(e) => setForm({ ...form, certifications: e.target.value })}
                placeholder={t.certPlaceholder}
                className="bg-white dark:bg-[#52575D] border-stone-300 dark:border-gray-600"
              />
            </div>

            {/* Years + Website row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-stone-600 dark:text-gray-400 mb-1 block">{t.yearsExperience}</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.years_experience}
                  onChange={(e) => setForm({ ...form, years_experience: e.target.value })}
                  className="bg-white dark:bg-[#52575D] border-stone-300 dark:border-gray-600"
                />
              </div>
              <div>
                <Label className="text-xs text-stone-600 dark:text-gray-400 mb-1 block">{t.website}</Label>
                <Input
                  type="url"
                  value={form.website_url}
                  onChange={(e) => setForm({ ...form, website_url: e.target.value })}
                  placeholder="https://..."
                  className="bg-white dark:bg-[#52575D] border-stone-300 dark:border-gray-600"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Storefront */}
        {step === 2 && (
          <div className="space-y-5 animate-in fade-in duration-300">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white">{t.step2Title}</h2>
              <p className="text-sm text-stone-500 dark:text-gray-400 mt-1">{t.step2Subtitle}</p>
            </div>

            {/* Tagline */}
            <div>
              <Label className="text-xs text-stone-600 dark:text-gray-400 mb-1 block">{t.tagline}</Label>
              <Input
                value={form.storefront_tagline}
                onChange={(e) => setForm({ ...form, storefront_tagline: e.target.value.slice(0, 100) })}
                placeholder={t.taglinePlaceholder}
                className="bg-white dark:bg-[#52575D] border-stone-300 dark:border-gray-600"
              />
              <p className="text-[10px] text-stone-400 dark:text-gray-500 mt-1">
                {t.taglineHint} ({form.storefront_tagline.length}/100)
              </p>
            </div>

            {/* Banner URL */}
            <div>
              <Label className="text-xs text-stone-600 dark:text-gray-400 mb-1 block">{t.bannerUrl}</Label>
              <Input
                type="url"
                value={form.storefront_banner_url}
                onChange={(e) => setForm({ ...form, storefront_banner_url: e.target.value })}
                placeholder="https://..."
                className="bg-white dark:bg-[#52575D] border-stone-300 dark:border-gray-600"
              />
            </div>

            {/* Live Preview */}
            <div>
              <Label className="text-xs text-stone-600 dark:text-gray-400 mb-2 block">{t.storefrontPreview}</Label>
              <div className="rounded-xl border border-stone-200 dark:border-gray-600 overflow-hidden bg-white dark:bg-[#3D4349]">
                {/* Banner area */}
                <div
                  className="h-28 bg-gradient-to-br from-tribe-green/30 to-tribe-green/10 relative"
                  style={
                    form.storefront_banner_url
                      ? {
                          backgroundImage: `url(${form.storefront_banner_url})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }
                      : undefined
                  }
                />
                {/* Profile section */}
                <div className="px-4 pb-4 -mt-10">
                  <Avatar className="w-20 h-20 border-4 border-white dark:border-[#3D4349]">
                    <AvatarImage src={avatarUrl || undefined} />
                    <AvatarFallback className="bg-tribe-green text-xl font-bold text-slate-900">
                      {form.name ? form.name[0]?.toUpperCase() : '?'}
                    </AvatarFallback>
                  </Avatar>
                  <h3 className="text-lg font-bold text-stone-900 dark:text-white mt-2">{form.name || 'Your Name'}</h3>
                  {form.storefront_tagline && (
                    <p className="text-sm text-stone-500 dark:text-gray-400 mt-0.5">{form.storefront_tagline}</p>
                  )}
                  {form.specialties.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {form.specialties.slice(0, 4).map((s) => (
                        <span
                          key={s}
                          className="px-2 py-0.5 bg-tribe-green/20 text-tribe-green text-[10px] font-medium rounded-full"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-stone-400 dark:text-gray-500 mt-2 text-center">{t.previewNote}</p>
            </div>
          </div>
        )}

        {/* Step 3: Monetization */}
        {step === 3 && (
          <div className="space-y-5 animate-in fade-in duration-300">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white">{t.step3Title}</h2>
              <p className="text-sm text-stone-500 dark:text-gray-400 mt-1">{t.step3Subtitle}</p>
            </div>

            {/* Feature Cards */}
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  icon: DollarSign,
                  title: t.featurePaidSessions,
                  desc: t.featurePaidSessionsDesc,
                  color: 'text-emerald-500',
                  bg: 'bg-emerald-50 dark:bg-emerald-900/20',
                },
                {
                  icon: Tag,
                  title: t.featurePromoCodes,
                  desc: t.featurePromoCodesDesc,
                  color: 'text-blue-500',
                  bg: 'bg-blue-50 dark:bg-blue-900/20',
                },
                {
                  icon: TrendingUp,
                  title: t.featureBoosts,
                  desc: t.featureBoostsDesc,
                  color: 'text-orange-500',
                  bg: 'bg-orange-50 dark:bg-orange-900/20',
                },
                {
                  icon: Megaphone,
                  title: t.featureAnnouncements,
                  desc: t.featureAnnouncementsDesc,
                  color: 'text-purple-500',
                  bg: 'bg-purple-50 dark:bg-purple-900/20',
                },
              ].map((feat) => (
                <div
                  key={feat.title}
                  className={`${feat.bg} rounded-xl p-3 border border-stone-100 dark:border-gray-700`}
                >
                  <feat.icon className={`w-6 h-6 ${feat.color} mb-2`} />
                  <h4 className="text-xs font-bold text-stone-900 dark:text-white mb-1">{feat.title}</h4>
                  <p className="text-[10px] text-stone-500 dark:text-gray-400 leading-relaxed">{feat.desc}</p>
                </div>
              ))}
            </div>

            {/* Currency Selector */}
            <div>
              <Label className="text-xs text-stone-600 dark:text-gray-400 mb-1 block">{t.earningsCurrency}</Label>
              <select
                value={form.earnings_currency}
                onChange={(e) => setForm({ ...form, earnings_currency: e.target.value })}
                className="w-full px-3 py-2.5 bg-white dark:bg-[#52575D] border border-stone-300 dark:border-gray-600 rounded-lg text-stone-900 dark:text-white focus-visible:ring-2 focus-visible:ring-tribe-green"
              >
                <option value="COP">{language === 'es' ? 'Pesos Colombianos (COP)' : 'Colombian Pesos (COP)'}</option>
                <option value="USD">{language === 'es' ? 'Dólares US (USD)' : 'US Dollars (USD)'}</option>
              </select>
            </div>

            {/* Info note */}
            <div className="bg-tribe-green/10 border border-tribe-green/30 rounded-xl p-4 flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-tribe-green shrink-0 mt-0.5" />
              <p className="text-xs text-stone-700 dark:text-gray-300 leading-relaxed">{t.readyNote}</p>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#3D4349] border-t border-stone-200 dark:border-gray-700 p-4 safe-area-bottom">
          <div className="max-w-lg mx-auto flex gap-3">
            {step > 1 && (
              <button
                onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                className="flex-1 py-3 rounded-xl font-semibold text-sm bg-stone-100 dark:bg-[#52575D] text-stone-700 dark:text-gray-300 hover:bg-stone-200 dark:hover:bg-[#6B7178] flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                {t.back}
              </button>
            )}
            {step < 3 ? (
              <button
                onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
                disabled={step === 1 && !form.name.trim()}
                className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition ${
                  step === 1 && !form.name.trim()
                    ? 'bg-stone-200 dark:bg-gray-600 text-stone-400 cursor-not-allowed'
                    : 'bg-tribe-green text-slate-900 hover:bg-[#8FD642]'
                }`}
              >
                {t.next}
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleFinish}
                disabled={saving}
                className="flex-1 py-3 rounded-xl font-bold text-sm bg-tribe-green text-slate-900 hover:bg-[#8FD642] flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <LoadingSpinner className="w-4 h-4" />
                    {t.saving}
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    {t.finish}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
