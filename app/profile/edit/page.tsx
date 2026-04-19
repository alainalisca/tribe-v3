/** Page: /profile/edit — Edit profile details, photos, sports, and emergency contact */
'use client';

import { SPORTS_LIST } from '@/lib/sports';
import { sportTranslations } from '@/lib/translations';
import { useLanguage } from '@/lib/LanguageContext';
import {
  ArrowLeft,
  Save,
  Upload,
  X,
  Sparkles,
  DollarSign,
  Tag,
  Zap,
  Bell,
  Check,
  Store,
  Camera,
  Image as ImageIcon,
  Link as LinkIcon,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useEditProfile } from './useEditProfile';

export default function EditProfilePage() {
  const { language } = useLanguage();
  const getTranslatedSport = (sport: string) => (language === 'es' ? sportTranslations[sport]?.es || sport : sport);

  const [wizardStep, setWizardStep] = useState<0 | 1 | 2 | 3>(0);

  const {
    tr,
    loading,
    error,
    saving,
    uploadingPhoto,
    uploadingBanner,
    formData,
    setFormData,
    handleAvatarUpload,
    handlePhotoUpload,
    handleBannerUpload,
    removePhoto,
    handleSave,
    toggleSport,
  } = useEditProfile(language);

  const bannerInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [bannerUseUrl, setBannerUseUrl] = useState(false);

  const triggerAvatarUpload = () => avatarInputRef.current?.click();

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <p className="text-theme-primary">{tr.loading}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-theme-page flex flex-col items-center justify-center p-4">
        <p className="text-theme-primary text-lg mb-4">
          {language === 'es' ? 'Algo salió mal' : 'Something went wrong'}
        </p>
        <Button onClick={() => window.location.reload()} className="px-6 py-3 font-bold">
          {language === 'es' ? 'Intentar de nuevo' : 'Try Again'}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center justify-between px-4">
          <div className="flex items-center">
            <Link href="/profile">
              <Button variant="ghost" size="icon" className="mr-3">
                <ArrowLeft className="w-6 h-6 text-theme-primary" />
              </Button>
            </Link>
            <h1 className="text-xl font-bold text-theme-primary">{tr.editProfile}</h1>
          </div>
          <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 font-semibold">
            <Save className="w-4 h-4" />
            {saving ? tr.saving : tr.save}
          </Button>
        </div>
      </div>

      <div className="pt-header max-w-2xl md:max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        {/* Welcome Banner - shown for incomplete profiles */}
        {!formData.bio && formData.sports.length === 0 && formData.photos.length === 0 && (
          <div className="bg-tribe-green rounded-xl p-4 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-slate-900 mt-0.5 flex-shrink-0" />
            <p className="text-slate-900 font-medium text-sm">{tr.welcomeBanner}</p>
          </div>
        )}

        {/* Avatar / Headshot — primary profile photo */}
        <div className="flex flex-col items-center mb-6">
          <div className="relative">
            <Avatar className="w-28 h-28 border-4 border-tribe-green/30">
              <AvatarImage src={formData.avatar_url || undefined} className="object-cover" />
              <AvatarFallback className="bg-tribe-green text-slate-900 text-3xl font-bold">
                {formData.name?.[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={triggerAvatarUpload}
              disabled={uploadingPhoto}
              className="absolute bottom-0 right-0 w-9 h-9 bg-tribe-green rounded-full flex items-center justify-center text-slate-900 shadow-lg border-2 border-white dark:border-tribe-card hover:bg-tribe-green-light transition-colors disabled:opacity-50"
              aria-label={tr.changePhoto}
            >
              <Camera className="w-4 h-4" />
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarUpload}
              disabled={uploadingPhoto}
            />
          </div>
          <p className="text-xs text-stone-500 dark:text-gray-400 mt-2 text-center">{tr.primaryPhoto}</p>
        </div>

        {/* Name */}
        <div>
          <Label className="font-semibold text-theme-primary mb-2">{tr.name}</Label>
          <Input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder={tr.namePlaceholder}
            autoComplete="name"
            enterKeyHint="next"
            className="h-auto py-3 dark:bg-tribe-mid dark:border-gray-600 dark:text-white placeholder-gray-500 focus-visible:ring-tribe-green"
          />
        </div>

        {/* Username */}
        <div>
          <Label className="font-semibold text-theme-primary mb-2">{tr.username}</Label>
          <Input
            type="text"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            placeholder="@username"
            autoComplete="username"
            enterKeyHint="next"
            className="h-auto py-3 dark:bg-tribe-mid dark:border-gray-600 dark:text-white placeholder-gray-500 focus-visible:ring-tribe-green"
          />
        </div>

        {/* Location */}
        <div>
          <Label className="font-semibold text-theme-primary mb-2">{tr.location}</Label>
          <Input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder={tr.locationPlaceholder}
            autoComplete="address-level2"
            enterKeyHint="next"
            className="h-auto py-3 dark:bg-tribe-mid dark:border-gray-600 dark:text-white placeholder-gray-500 focus-visible:ring-tribe-green"
          />
        </div>

        {/* Bio */}
        <div>
          <Label className="font-semibold text-theme-primary mb-2">{tr.bio}</Label>
          <Textarea
            value={formData.bio}
            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
            placeholder={tr.bioPlaceholder}
            rows={4}
            className="py-3 dark:bg-tribe-mid dark:border-gray-600 dark:text-white placeholder-gray-500 focus-visible:ring-tribe-green resize-none"
          />
        </div>

        {/* Social Media Links */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <h3 className="text-sm font-bold text-theme-primary mb-3 flex items-center gap-2">🔗 {tr.socialMedia}</h3>
          <p className="text-xs text-stone-600 dark:text-gray-400 mb-4">{tr.socialDesc}</p>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-theme-secondary mb-1">📷 Instagram {tr.instagramLabel}</Label>
              <div className="flex items-center">
                <span className="px-3 py-2 bg-stone-200 dark:bg-tribe-surface border border-r-0 border-stone-300 dark:border-gray-600 rounded-l-xl text-sm text-stone-500">
                  @
                </span>
                <Input
                  type="text"
                  value={formData.instagram_username}
                  onChange={(e) => setFormData({ ...formData, instagram_username: e.target.value.replace('@', '') })}
                  placeholder="username"
                  className="flex-1 rounded-l-none rounded-r-xl dark:bg-tribe-mid dark:border-gray-600 dark:text-white placeholder-gray-500 focus-visible:ring-tribe-green"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-theme-secondary mb-1">📘 Facebook {tr.facebookLabel}</Label>
              <Input
                type="url"
                value={formData.facebook_url}
                onChange={(e) => setFormData({ ...formData, facebook_url: e.target.value })}
                placeholder="https://facebook.com/yourprofile"
                className="dark:bg-tribe-mid dark:border-gray-600 dark:text-white placeholder-gray-500 focus-visible:ring-tribe-green"
              />
            </div>
          </div>
        </div>

        {/* ─── Instructor Profile ─── */}
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 space-y-4">
          {wizardStep === 0 ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-theme-primary flex items-center gap-2">
                    {language === 'es' ? '🏋️ Perfil de Instructor' : '🏋️ Instructor Profile'}
                  </h3>
                  <p className="text-xs text-stone-600 dark:text-gray-400 mt-1">
                    {language === 'es'
                      ? 'Activa para crear sesiones de pago y aparecer en Discover'
                      : 'Enable to create paid sessions and appear on Discover'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.is_instructor}
                  onClick={() => {
                    if (!formData.is_instructor) {
                      setFormData({ ...formData, is_instructor: true });
                      setWizardStep(1);
                    } else {
                      setFormData({ ...formData, is_instructor: false });
                    }
                  }}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tribe-green ${formData.is_instructor ? 'bg-tribe-green' : 'bg-stone-400'}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-lg transform transition-transform ${formData.is_instructor ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Step Indicator */}
              <div className="flex items-center justify-between px-2 mb-6">
                {[1, 2, 3].map((step) => (
                  <div key={step} className="flex items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition ${
                        wizardStep > step
                          ? 'bg-tribe-green text-slate-900'
                          : wizardStep === step
                            ? 'bg-tribe-green text-slate-900'
                            : 'border-2 border-stone-300 dark:border-gray-600 text-theme-secondary'
                      }`}
                    >
                      {wizardStep > step ? <Check className="w-4 h-4" /> : step}
                    </div>
                    {step < 3 && (
                      <div
                        className={`flex-1 h-0.5 mx-2 transition ${wizardStep > step ? 'bg-tribe-green' : 'bg-stone-300 dark:bg-stone-600'}`}
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="text-center mb-4">
                <h3 className="text-sm font-bold text-theme-primary">
                  {wizardStep === 1 && (language === 'es' ? '1. Identidad Profesional' : '1. Professional Identity')}
                  {wizardStep === 2 && (language === 'es' ? '2. Tu Escaparate' : '2. Your Storefront')}
                  {wizardStep === 3 && (language === 'es' ? '3. Monetización' : '3. Monetization')}
                </h3>
              </div>

              {/* Step 1: Professional Identity */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs text-theme-secondary mb-1 block">
                      {language === 'es' ? 'Bio profesional' : 'Professional Bio'}
                    </Label>
                    <Textarea
                      value={formData.instructor_bio}
                      onChange={(e) => setFormData({ ...formData, instructor_bio: e.target.value })}
                      placeholder={
                        language === 'es'
                          ? 'Ej: NASM-CPT con 8 años de experiencia en...'
                          : 'E.g. NASM-CPT with 8 years of experience in...'
                      }
                      rows={3}
                      className="py-2 dark:bg-tribe-mid dark:border-gray-600 dark:text-white placeholder-gray-500 focus-visible:ring-tribe-green resize-none"
                    />
                    <p className="text-xs text-stone-600 dark:text-gray-400 mt-1">
                      {language === 'es'
                        ? 'Esto aparece en tu escaparate y ayuda a los atletas a decidir reservar contigo'
                        : 'This appears on your storefront and helps athletes decide to book with you'}
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs text-theme-secondary mb-1 block">
                      {language === 'es' ? 'Especialidades (separadas por coma)' : 'Specialties (comma-separated)'}
                    </Label>
                    <Input
                      type="text"
                      value={formData.specialties.join(', ')}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          specialties: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="E.g. CrossFit, HIIT, Yoga, Pilates"
                      className="h-auto py-2 dark:bg-tribe-mid dark:border-gray-600 dark:text-white placeholder-gray-500 focus-visible:ring-tribe-green"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-theme-secondary mb-1 block">
                      {language === 'es' ? 'Certificaciones (separadas por coma)' : 'Certifications (comma-separated)'}
                    </Label>
                    <Input
                      type="text"
                      value={formData.certifications.join(', ')}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          certifications: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="E.g. NASM-CPT, Yoga RYT-200"
                      className="h-auto py-2 dark:bg-tribe-mid dark:border-gray-600 dark:text-white placeholder-gray-500 focus-visible:ring-tribe-green"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-theme-secondary mb-1 block">
                      {language === 'es' ? 'Años de experiencia' : 'Years of Experience'}
                    </Label>
                    <Input
                      type="number"
                      value={formData.years_experience ?? ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          years_experience: e.target.value ? parseInt(e.target.value, 10) : null,
                        })
                      }
                      min="0"
                      max="60"
                      placeholder="5"
                      className="h-auto py-2 dark:bg-tribe-mid dark:border-gray-600 dark:text-white placeholder-gray-500 focus-visible:ring-tribe-green"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-theme-secondary mb-1 block">
                      {language === 'es' ? 'Sitio web' : 'Website'}
                    </Label>
                    <Input
                      type="url"
                      value={formData.website_url}
                      onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
                      placeholder="https://yourwebsite.com"
                      className="h-auto py-2 dark:bg-tribe-mid dark:border-gray-600 dark:text-white placeholder-gray-500 focus-visible:ring-tribe-green"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => {
                        setFormData({ ...formData, is_instructor: false });
                        setWizardStep(0);
                      }}
                      className="flex-1 bg-stone-100 dark:bg-tribe-surface text-stone-700 dark:text-gray-300 rounded-xl py-2 font-semibold hover:bg-stone-200 dark:hover:bg-tribe-surface-hover transition"
                    >
                      {language === 'es' ? 'Atrás' : 'Back'}
                    </button>
                    <button
                      onClick={() => setWizardStep(2)}
                      className="flex-1 bg-tribe-green text-slate-900 rounded-xl py-2 font-semibold hover:bg-tribe-green transition"
                    >
                      {language === 'es' ? 'Siguiente' : 'Next'}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Your Storefront */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div className="bg-white dark:bg-tribe-surface rounded-xl p-4 border border-stone-200 dark:border-tribe-mid mb-4">
                    <h4 className="text-xs font-semibold text-theme-secondary mb-3">
                      {language === 'es' ? 'Vista previa de tu escaparate' : 'Storefront Preview'}
                    </h4>
                    <div className="flex flex-col items-center text-center">
                      <div className="w-16 h-16 bg-tribe-green rounded-full flex items-center justify-center text-slate-900 font-bold mb-2">
                        {formData.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .substring(0, 2)
                          .toUpperCase() || 'IN'}
                      </div>
                      <h3 className="font-semibold text-theme-primary text-sm">{formData.name || 'Your Name'}</h3>
                      <p className="text-xs text-stone-600 dark:text-gray-400 mb-2">
                        {formData.storefront_tagline || (language === 'es' ? 'Tu descripción' : 'Your tagline')}
                      </p>
                      {formData.specialties.length > 0 && (
                        <div className="flex flex-wrap gap-1 justify-center">
                          {formData.specialties.slice(0, 3).map((spec) => (
                            <span
                              key={spec}
                              className="px-2 py-0.5 bg-tribe-green text-slate-900 rounded-full text-xs font-semibold"
                            >
                              {spec}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-theme-secondary mb-1 block">
                      {language === 'es' ? 'Descripción de una línea (tagline)' : 'One-line tagline'}
                    </Label>
                    <Input
                      type="text"
                      value={formData.storefront_tagline}
                      onChange={(e) => setFormData({ ...formData, storefront_tagline: e.target.value })}
                      placeholder={
                        language === 'es' ? 'Ej: Entrenador de fitness certificado' : 'E.g. Certified fitness coach'
                      }
                      maxLength={100}
                      className="h-auto py-2 dark:bg-tribe-mid dark:border-gray-600 dark:text-white placeholder-gray-500 focus-visible:ring-tribe-green"
                    />
                    <p className="text-xs text-stone-600 dark:text-gray-400 mt-1">
                      {language === 'es'
                        ? 'Una descripción de una línea que aparece debajo de tu nombre'
                        : 'A one-line description that appears under your name'}
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs text-theme-secondary mb-1 block">
                      {language === 'es' ? 'Imagen de banner (opcional)' : 'Banner image (optional)'}
                    </Label>
                    <input
                      ref={bannerInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        handleBannerUpload(e);
                        if (bannerInputRef.current) bannerInputRef.current.value = '';
                      }}
                      className="hidden"
                    />

                    {formData.storefront_banner_url && !bannerUseUrl ? (
                      <div className="relative rounded-lg overflow-hidden border border-stone-200 dark:border-gray-600">
                        <img
                          src={formData.storefront_banner_url}
                          alt="Banner preview"
                          className="w-full h-24 object-cover"
                        />
                        <div className="absolute bottom-2 right-2 flex gap-1">
                          <button
                            type="button"
                            onClick={() => bannerInputRef.current?.click()}
                            disabled={uploadingBanner}
                            className="px-2 py-1 bg-white/90 dark:bg-black/70 text-xs font-medium rounded-md text-stone-700 dark:text-gray-200 hover:bg-white dark:hover:bg-black/90"
                          >
                            {language === 'es' ? 'Cambiar' : 'Change'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, storefront_banner_url: '' })}
                            className="px-2 py-1 bg-red-500/90 text-xs font-medium rounded-md text-white hover:bg-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ) : !bannerUseUrl ? (
                      <button
                        type="button"
                        onClick={() => bannerInputRef.current?.click()}
                        disabled={uploadingBanner}
                        className="w-full h-20 border-2 border-dashed border-stone-300 dark:border-gray-600 rounded-lg flex flex-col items-center justify-center gap-1 hover:border-tribe-green transition"
                      >
                        {uploadingBanner ? (
                          <>
                            <span className="text-xs text-stone-500 dark:text-gray-400">
                              {language === 'es' ? 'Subiendo...' : 'Uploading...'}
                            </span>
                          </>
                        ) : (
                          <>
                            <ImageIcon className="w-5 h-5 text-stone-400 dark:text-gray-500" />
                            <span className="text-xs text-stone-500 dark:text-gray-400">
                              {language === 'es' ? 'Subir imagen' : 'Upload image'}
                            </span>
                          </>
                        )}
                      </button>
                    ) : null}

                    {bannerUseUrl ? (
                      <div className="space-y-2">
                        <Input
                          type="url"
                          value={formData.storefront_banner_url}
                          onChange={(e) => setFormData({ ...formData, storefront_banner_url: e.target.value })}
                          placeholder="https://example.com/banner.jpg"
                          className="h-auto py-2 dark:bg-tribe-mid dark:border-gray-600 dark:text-white placeholder-gray-500 focus-visible:ring-tribe-green"
                        />
                        <button
                          type="button"
                          onClick={() => setBannerUseUrl(false)}
                          className="text-xs text-tribe-green hover:underline flex items-center gap-1"
                        >
                          <ImageIcon className="w-3 h-3" />
                          {language === 'es' ? 'Subir imagen' : 'Upload image'}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setBannerUseUrl(true)}
                        className="mt-1 text-xs text-stone-500 dark:text-gray-400 hover:text-tribe-green flex items-center gap-1"
                      >
                        <LinkIcon className="w-3 h-3" />
                        {language === 'es' ? 'O pegar una URL' : 'Or paste a URL'}
                      </button>
                    )}
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-xs text-stone-700 dark:text-gray-300">
                      {language === 'es'
                        ? 'Tu escaparate es tu página pública en /storefront/tu-id. Los atletas te descubren aquí.'
                        : 'Your storefront is your public page at /storefront/your-id. Athletes discover you here.'}
                    </p>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setWizardStep(1)}
                      className="flex-1 bg-stone-100 dark:bg-tribe-surface text-stone-700 dark:text-gray-300 rounded-xl py-2 font-semibold hover:bg-stone-200 dark:hover:bg-tribe-surface-hover transition"
                    >
                      {language === 'es' ? 'Atrás' : 'Back'}
                    </button>
                    <button
                      onClick={() => setWizardStep(3)}
                      className="flex-1 bg-tribe-green text-slate-900 rounded-xl py-2 font-semibold hover:bg-tribe-green transition"
                    >
                      {language === 'es' ? 'Siguiente' : 'Next'}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Monetization Overview */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white dark:bg-tribe-surface rounded-xl p-4 border border-stone-200 dark:border-tribe-mid">
                      <DollarSign className="w-6 h-6 text-tribe-green mb-2" />
                      <h4 className="text-xs font-semibold text-theme-primary mb-1">
                        {language === 'es' ? 'Sesiones de Pago' : 'Paid Sessions'}
                      </h4>
                      <p className="text-xs text-stone-600 dark:text-gray-400">
                        {language === 'es'
                          ? 'Establece precios en tus sesiones y cobra pagos'
                          : 'Set prices on your sessions and collect payments'}
                      </p>
                    </div>

                    <div className="bg-white dark:bg-tribe-surface rounded-xl p-4 border border-stone-200 dark:border-tribe-mid">
                      <Tag className="w-6 h-6 text-tribe-green mb-2" />
                      <h4 className="text-xs font-semibold text-theme-primary mb-1">
                        {language === 'es' ? 'Códigos Promo' : 'Promo Codes'}
                      </h4>
                      <p className="text-xs text-stone-600 dark:text-gray-400">
                        {language === 'es'
                          ? 'Crea códigos de descuento para atraer nuevos clientes'
                          : 'Create discount codes to attract new clients'}
                      </p>
                    </div>

                    <div className="bg-white dark:bg-tribe-surface rounded-xl p-4 border border-stone-200 dark:border-tribe-mid">
                      <Zap className="w-6 h-6 text-tribe-green mb-2" />
                      <h4 className="text-xs font-semibold text-theme-primary mb-1">
                        {language === 'es' ? 'Campañas de Impulso' : 'Boost Campaigns'}
                      </h4>
                      <p className="text-xs text-stone-600 dark:text-gray-400">
                        {language === 'es'
                          ? 'Paga para promocionar sesiones en el feed de descubrimiento'
                          : 'Pay to promote sessions in the discovery feed'}
                      </p>
                    </div>

                    <div className="bg-white dark:bg-tribe-surface rounded-xl p-4 border border-stone-200 dark:border-tribe-mid">
                      <Bell className="w-6 h-6 text-tribe-green mb-2" />
                      <h4 className="text-xs font-semibold text-theme-primary mb-1">
                        {language === 'es' ? 'Anuncios' : 'Announcements'}
                      </h4>
                      <p className="text-xs text-stone-600 dark:text-gray-400">
                        {language === 'es'
                          ? 'Publica actualizaciones que llegan a tus seguidores'
                          : 'Post updates that push to your followers'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-theme-secondary mb-1 block">
                      {language === 'es' ? 'Moneda de ganancias' : 'Earnings Currency'}
                    </Label>
                    <select
                      value={formData.earnings_currency || 'COP'}
                      onChange={(e) => setFormData({ ...formData, earnings_currency: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-tribe-mid border border-stone-300 dark:border-gray-600 rounded-lg text-theme-primary dark:text-white focus-visible:ring-2 focus-visible:ring-tribe-green"
                    >
                      <option value="COP">
                        {language === 'es' ? 'Pesos Colombianos (COP)' : 'Colombian Pesos (COP)'}
                      </option>
                      <option value="USD">{language === 'es' ? 'Dólares US (USD)' : 'US Dollars (USD)'}</option>
                    </select>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-xs text-stone-700 dark:text-gray-300">
                      {language === 'es'
                        ? 'Puedes configurar estas funciones en cualquier momento desde el hub de Promoción (/promote)'
                        : 'You can set up these features anytime from the Promote hub (/promote)'}
                    </p>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setWizardStep(2)}
                      className="flex-1 bg-stone-100 dark:bg-tribe-surface text-stone-700 dark:text-gray-300 rounded-xl py-2 font-semibold hover:bg-stone-200 dark:hover:bg-tribe-surface-hover transition"
                    >
                      {language === 'es' ? 'Atrás' : 'Back'}
                    </button>
                    <button
                      onClick={() => setWizardStep(0)}
                      className="flex-1 bg-tribe-green text-slate-900 rounded-xl py-2 font-semibold hover:bg-tribe-green transition"
                    >
                      {language === 'es' ? 'Listo' : 'Done'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Emergency Contact */}
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
          <h3 className="text-sm font-bold text-theme-primary mb-3 flex items-center gap-2">
            🚨 {tr.emergencyContact}
          </h3>
          <p className="text-xs text-stone-600 dark:text-gray-400 mb-4">{tr.emergencyDesc}</p>

          <div className="space-y-3">
            <div>
              <Label className="font-semibold text-theme-primary mb-2">{tr.contactName}</Label>
              <Input
                type="text"
                value={formData.emergency_contact_name}
                onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                placeholder={tr.contactNamePlaceholder}
                className="h-auto py-3 dark:bg-tribe-mid dark:border-gray-600 text-theme-primary placeholder-gray-500 focus-visible:ring-tribe-green"
              />
            </div>

            <div>
              <Label className="font-semibold text-theme-primary mb-2">{tr.contactPhone}</Label>
              <Input
                type="tel"
                value={formData.emergency_contact_phone}
                onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                placeholder={tr.contactPhonePlaceholder}
                autoComplete="tel"
                enterKeyHint="done"
                className="h-auto py-3 dark:bg-tribe-mid dark:border-gray-600 text-theme-primary placeholder-gray-500 focus-visible:ring-tribe-green"
              />
            </div>
          </div>
        </div>

        {/* Photos */}
        <div>
          <Label className="font-semibold text-theme-primary mb-3">
            {tr.photos} ({formData.photos.length}/8)
          </Label>
          <div className="grid grid-cols-3 gap-3">
            {formData.photos.map((photo, index) => (
              <div key={index} className="relative aspect-square">
                <Image
                  src={photo}
                  alt={`Profile photo ${index + 1}`}
                  fill
                  className="object-cover rounded-lg"
                  unoptimized
                />
                <button
                  onClick={() => removePhoto(index)}
                  className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            {formData.photos.length < 8 && (
              <label className="aspect-square border-2 border-dashed border-stone-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-tribe-green transition">
                <Upload className="w-8 h-8 text-stone-400 mb-2" />
                <span className="text-xs text-stone-500">{tr.addPhoto}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handlePhotoUpload}
                  disabled={uploadingPhoto}
                />
              </label>
            )}
          </div>
        </div>

        {/* Sports */}
        <div>
          <Label className="font-semibold text-theme-primary mb-3">{tr.sports}</Label>
          <div className="flex flex-wrap gap-2">
            {SPORTS_LIST.map((sport) => (
              <button
                key={getTranslatedSport(sport)}
                onClick={() => toggleSport(sport)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                  formData.sports.includes(sport)
                    ? 'bg-tribe-green text-slate-900'
                    : 'bg-white dark:bg-tribe-mid text-theme-secondary border border-stone-300 dark:border-gray-600'
                }`}
              >
                {getTranslatedSport(sport)}
              </button>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <Button onClick={handleSave} disabled={saving} className="w-full py-4 font-bold rounded-2xl text-lg">
          {saving ? tr.saving : tr.saveProfile}
        </Button>
      </div>
    </div>
  );
}
