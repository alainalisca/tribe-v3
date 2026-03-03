/** Page: /profile/edit — Edit profile details, photos, sports, and emergency contact */
'use client';
import { logError } from '@/lib/logger';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { getErrorMessage } from '@/lib/errorMessages';

import { SPORTS_LIST } from '@/lib/sports';
import { sportTranslations } from '@/lib/translations';
import { useLanguage } from '@/lib/LanguageContext';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Upload, X, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';

export default function EditProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const { language } = useLanguage();
  const getTranslatedSport = (sport: string) => (language === 'es' ? sportTranslations[sport]?.es || sport : sport);

  const tr = {
    editProfile: language === 'es' ? 'Editar Perfil' : 'Edit Profile',
    save: language === 'es' ? 'Guardar' : 'Save',
    saving: language === 'es' ? 'Guardando...' : 'Saving...',
    loading: language === 'es' ? 'Cargando...' : 'Loading...',
    name: language === 'es' ? 'Nombre' : 'Name',
    namePlaceholder: language === 'es' ? 'Tu nombre' : 'Your name',
    username: language === 'es' ? 'Nombre de usuario' : 'Username',
    location: language === 'es' ? 'Ubicación' : 'Location',
    locationPlaceholder: language === 'es' ? 'Ciudad, Estado/País' : 'City, State/Country',
    bio: language === 'es' ? 'Biografía' : 'Bio',
    bioPlaceholder: language === 'es' ? 'Cuéntanos sobre ti...' : 'Tell us about yourself...',
    photos: language === 'es' ? 'Fotos' : 'Photos',
    addPhoto: language === 'es' ? 'Agregar Foto' : 'Add Photo',
    maxPhotos: language === 'es' ? 'Máximo 6 fotos permitidas' : 'Maximum 6 photos allowed',
    sports: language === 'es' ? 'Deportes y Actividades' : 'Sports & Activities',
    saveProfile: language === 'es' ? 'Guardar Perfil' : 'Save Profile',
    profileUpdated: language === 'es' ? '¡Perfil actualizado con éxito!' : 'Profile updated successfully!',
    emergencyContact:
      language === 'es'
        ? 'Contacto de Emergencia (Opcional pero Recomendado)'
        : 'Emergency Contact (Optional but Recommended)',
    emergencyDesc:
      language === 'es'
        ? 'Información de contacto de emergencia en caso de accidente durante una sesión'
        : 'Emergency contact information in case of an incident during a session',
    contactName: language === 'es' ? 'Nombre de Contacto' : 'Contact Name',
    contactPhone: language === 'es' ? 'Teléfono de Contacto' : 'Contact Phone',
    socialMedia: language === 'es' ? 'Redes Sociales (Recomendado)' : 'Social Media (Recommended)',
    socialDesc:
      language === 'es'
        ? 'Ayuda a otros a verificar que eres una persona real. Los compañeros de entrenamiento pueden revisar tu perfil antes de unirse.'
        : 'Help others verify you are a real person. Training partners can check your profile before joining.',
    instagramLabel: language === 'es' ? '(nombre de usuario)' : '(username)',
    facebookLabel: language === 'es' ? '(URL del perfil)' : '(profile URL)',
    welcomeBanner:
      language === 'es'
        ? '¡Bienvenido a Tribe! Completa tu perfil para encontrar compañeros de entrenamiento cerca de ti.'
        : 'Welcome to Tribe! Complete your profile to find training partners near you.',
    contactNamePlaceholder: language === 'es' ? 'ej. Juan Pérez' : 'e.g. John Smith',
    contactPhonePlaceholder: language === 'es' ? 'ej. +57 300 123 4567' : 'e.g. +1 (555) 123-4567',
  };

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    username: '',
    bio: '',
    location: '',
    sports: [] as string[],
    photos: [] as string[],
    emergency_contact_name: '',
    emergency_contact_phone: '',
    instagram_username: '',
    facebook_url: '',
  });

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  async function loadProfile() {
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) {
        router.push('/auth');
        return;
      }
      setUser(authUser);

      const { data: profileData } = await supabase.from('users').select('*').eq('id', authUser.id).single();

      if (profileData) {
        setFormData({
          name: profileData.name || '',
          username: profileData.username || '',
          bio: profileData.bio || '',
          location: profileData.location || '',
          sports: profileData.sports || [],
          photos: profileData.photos || [],
          emergency_contact_name: profileData.emergency_contact_name || '',
          emergency_contact_phone: profileData.emergency_contact_phone || '',
          instagram_username: profileData.instagram_username || '',
          facebook_url: profileData.facebook_url || '',
        });
      }
    } catch (error) {
      logError(error, { action: 'loadProfile' });
    } finally {
      setLoading(false);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (formData.photos.length >= 6) {
      showInfo(tr.maxPhotos);
      return;
    }

    try {
      setUploadingPhoto(true);

      const fileExt = file.name.split('.').pop();
      const fileName = `photo-${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `photos/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('profile-images').upload(filePath, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('profile-images').getPublicUrl(filePath);

      setFormData({
        ...formData,
        photos: [...formData.photos, publicUrl],
      });
    } catch (error) {
      logError(error, { action: 'handlePhotoUpload' });
      showError(getErrorMessage(error, 'upload_photo', language));
    } finally {
      setUploadingPhoto(false);
    }
  }

  function removePhoto(index: number) {
    setFormData({
      ...formData,
      photos: formData.photos.filter((_, i) => i !== index),
    });
  }

  async function handleSave() {
    if (!user) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from('users')
        .update({
          name: formData.name,
          username: formData.username,
          bio: formData.bio,
          location: formData.location,
          sports: formData.sports,
          photos: formData.photos,
          emergency_contact_name: formData.emergency_contact_name,
          emergency_contact_phone: formData.emergency_contact_phone,
          instagram_username: formData.instagram_username,
          facebook_url: formData.facebook_url,
        })
        .eq('id', user.id);

      if (error) throw error;

      showSuccess(tr.profileUpdated);
      router.push('/profile');
    } catch (error: unknown) {
      logError(error, { action: 'handleSave' });
      showError(getErrorMessage(error, 'update_profile', language));
    } finally {
      setSaving(false);
    }
  }

  function toggleSport(sport: string) {
    if (formData.sports.includes(sport)) {
      setFormData({
        ...formData,
        sports: formData.sports.filter((s) => s !== sport),
      });
    } else {
      setFormData({
        ...formData,
        sports: [...formData.sports, sport],
      });
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <p className="text-theme-primary">{tr.loading}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center justify-between px-4">
          <div className="flex items-center">
            <Link href="/profile">
              <button className="p-2 hover:bg-stone-200 rounded-lg transition mr-3">
                <ArrowLeft className="w-6 h-6 text-theme-primary" />
              </button>
            </Link>
            <h1 className="text-xl font-bold text-theme-primary">{tr.editProfile}</h1>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-tribe-green text-slate-900 font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? tr.saving : tr.save}
          </button>
        </div>
      </div>

      <div className="pt-header max-w-2xl mx-auto p-4 space-y-6">
        {/* Welcome Banner - shown for incomplete profiles */}
        {!formData.bio && formData.sports.length === 0 && formData.photos.length === 0 && (
          <div className="bg-tribe-green rounded-xl p-4 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-slate-900 mt-0.5 flex-shrink-0" />
            <p className="text-slate-900 font-medium text-sm">{tr.welcomeBanner}</p>
          </div>
        )}

        {/* Name */}
        <div>
          <label className="block text-sm font-semibold text-theme-primary mb-2">{tr.name}</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder={tr.namePlaceholder}
            autoComplete="name"
            enterKeyHint="next"
            className="w-full px-4 py-3 bg-white border border-stone-300 rounded-xl text-stone-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-tribe-green"
          />
        </div>

        {/* Username */}
        <div>
          <label className="block text-sm font-semibold text-theme-primary mb-2">{tr.username}</label>
          <input
            type="text"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            placeholder="@username"
            autoComplete="username"
            enterKeyHint="next"
            className="w-full px-4 py-3 bg-white border border-stone-300 rounded-xl text-stone-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-tribe-green"
          />
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-semibold text-theme-primary mb-2">{tr.location}</label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder={tr.locationPlaceholder}
            autoComplete="address-level2"
            enterKeyHint="next"
            className="w-full px-4 py-3 bg-white border border-stone-300 rounded-xl text-stone-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-tribe-green"
          />
        </div>

        {/* Bio */}
        <div>
          <label className="block text-sm font-semibold text-theme-primary mb-2">{tr.bio}</label>
          <textarea
            value={formData.bio}
            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
            placeholder={tr.bioPlaceholder}
            rows={4}
            className="w-full px-4 py-3 bg-white border border-stone-300 rounded-xl text-stone-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-tribe-green resize-none"
          />
        </div>

        {/* Photos */}

        {/* Social Media Links */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <h3 className="text-sm font-bold text-theme-primary mb-3 flex items-center gap-2">🔗 {tr.socialMedia}</h3>
          <p className="text-xs text-stone-600 dark:text-gray-400 mb-4">{tr.socialDesc}</p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-theme-secondary mb-1">
                📷 Instagram {tr.instagramLabel}
              </label>
              <div className="flex items-center">
                <span className="px-3 py-2 bg-stone-200 dark:bg-[#404549] border border-r-0 border-stone-300 dark:border-gray-600 rounded-l-xl text-sm text-stone-500">
                  @
                </span>
                <input
                  type="text"
                  value={formData.instagram_username}
                  onChange={(e) => setFormData({ ...formData, instagram_username: e.target.value.replace('@', '') })}
                  placeholder="username"
                  className="flex-1 px-3 py-2 bg-white dark:bg-[#52575D] border border-stone-300 dark:border-gray-600 rounded-r-xl text-stone-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-tribe-green"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-theme-secondary mb-1">
                📘 Facebook {tr.facebookLabel}
              </label>
              <input
                type="url"
                value={formData.facebook_url}
                onChange={(e) => setFormData({ ...formData, facebook_url: e.target.value })}
                placeholder="https://facebook.com/yourprofile"
                className="w-full px-3 py-2 bg-white dark:bg-[#52575D] border border-stone-300 dark:border-gray-600 rounded-xl text-stone-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-tribe-green"
              />
            </div>
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
          <h3 className="text-sm font-bold text-theme-primary mb-3 flex items-center gap-2">
            🚨 {tr.emergencyContact}
          </h3>
          <p className="text-xs text-stone-600 dark:text-gray-400 mb-4">{tr.emergencyDesc}</p>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-theme-primary mb-2">{tr.contactName}</label>
              <input
                type="text"
                value={formData.emergency_contact_name}
                onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                placeholder={tr.contactNamePlaceholder}
                className="w-full px-4 py-3 bg-white dark:bg-[#52575D] border border-stone-300 dark:border-gray-600 rounded-xl text-theme-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-tribe-green"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-theme-primary mb-2">{tr.contactPhone}</label>
              <input
                type="tel"
                value={formData.emergency_contact_phone}
                onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                placeholder={tr.contactPhonePlaceholder}
                autoComplete="tel"
                enterKeyHint="done"
                className="w-full px-4 py-3 bg-white dark:bg-[#52575D] border border-stone-300 dark:border-gray-600 rounded-xl text-theme-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-tribe-green"
              />
            </div>
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-theme-primary mb-3">
            {tr.photos} ({formData.photos.length}/6)
          </label>
          <div className="grid grid-cols-3 gap-3">
            {formData.photos.map((photo, index) => (
              <div key={index} className="relative aspect-square">
                <img src={photo} alt={`Photo ${index + 1}`} className="w-full h-full object-cover rounded-lg" />
                <button
                  onClick={() => removePhoto(index)}
                  className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            {formData.photos.length < 6 && (
              <label className="aspect-square border-2 border-dashed border-stone-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-tribe-green transition">
                <Upload className="w-8 h-8 text-stone-400 mb-2" />
                <span className="text-xs text-stone-500">{tr.addPhoto}</span>
                <input
                  type="file"
                  accept="image/*"
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
          <label className="block text-sm font-semibold text-theme-primary mb-3">{tr.sports}</label>
          <div className="flex flex-wrap gap-2">
            {SPORTS_LIST.map((sport) => (
              <button
                key={getTranslatedSport(sport)}
                onClick={() => toggleSport(sport)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                  formData.sports.includes(sport)
                    ? 'bg-tribe-green text-slate-900'
                    : 'bg-white text-theme-secondary border border-stone-300'
                }`}
              >
                {getTranslatedSport(sport)}
              </button>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 bg-tribe-green text-slate-900 font-bold rounded-2xl hover:opacity-90 transition disabled:opacity-50 text-lg"
        >
          {saving ? tr.saving : tr.saveProfile}
        </button>
      </div>
    </div>
  );
}
