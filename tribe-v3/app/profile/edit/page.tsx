'use client';
import { showSuccess, showError, showInfo } from '@/lib/toast';
import { getErrorMessage } from "@/lib/errorMessages";

import { SPORTS_LIST } from '@/lib/sports';
import { sportTranslations } from '@/lib/translations';
import { useLanguage } from '@/lib/LanguageContext';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Upload, X } from 'lucide-react';
import Link from 'next/link';

export default function EditProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const { t, language } = useLanguage();
  const getTranslatedSport = (sport: string) => language === "es" ? (sportTranslations[sport]?.es || sport) : sport;
  const [user, setUser] = useState<any>(null);
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
    emergency_contact_name: "",
    emergency_contact_phone: "",
  });

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push('/auth');
        return;
      }
      setUser(authUser);

      const { data: profileData } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (profileData) {
        setFormData({
          name: profileData.name || '',
          username: profileData.username || '',
          bio: profileData.bio || '',
          location: profileData.location || '',
          sports: profileData.sports || [],
          photos: profileData.photos || [],
          emergency_contact_name: profileData.emergency_contact_name || "",
          emergency_contact_phone: profileData.emergency_contact_phone || "",
        });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (formData.photos.length >= 6) {
      showInfo('Maximum 6 photos allowed');
      return;
    }

    try {
      setUploadingPhoto(true);

      const fileExt = file.name.split('.').pop();
      const fileName = `photo-${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `photos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('profile-images')
        .getPublicUrl(filePath);

      setFormData({
        ...formData,
        photos: [...formData.photos, publicUrl],
      });
    } catch (error) {
      console.error('Error uploading photo:', error);
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
        })
        .eq('id', user.id);

      if (error) throw error;

      showSuccess('Profile updated successfully!');
      router.push('/profile');
    } catch (error: any) {
      console.error('Error updating profile:', error);
      showError(getErrorMessage(error, 'update_profile', language));
    } finally {
      setSaving(false);
    }
  }

  function toggleSport(sport: string) {
    if (formData.sports.includes(sport)) {
      setFormData({
        ...formData,
        sports: formData.sports.filter(s => s !== sport),
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
        <p className="text-theme-primary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      {/* Header */}
      <div className="bg-theme-card p-4 sticky top-0 z-10 border-b border-theme">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center">
            <Link href="/profile">
              <button className="p-2 hover:bg-stone-200 rounded-lg transition mr-3">
                <ArrowLeft className="w-6 h-6 text-theme-primary" />
              </button>
            </Link>
            <h1 className="text-xl font-bold text-theme-primary">{language === 'es' ? 'Editar Perfil' : 'Edit Profile'}</h1>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-tribe-green text-slate-900 font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Name */}
        <div>
          <label className="block text-sm font-semibold text-theme-primary mb-2">Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Your name"
            className="w-full px-4 py-3 bg-white border border-stone-300 rounded-xl text-stone-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-tribe-green"
          />
        </div>

        {/* Username */}
        <div>
          <label className="block text-sm font-semibold text-theme-primary mb-2">Username</label>
          <input
            type="text"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            placeholder="@username"
            className="w-full px-4 py-3 bg-white border border-stone-300 rounded-xl text-stone-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-tribe-green"
          />
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-semibold text-theme-primary mb-2">Location</label>
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder="City, State/Country"
            className="w-full px-4 py-3 bg-white border border-stone-300 rounded-xl text-stone-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-tribe-green"
          />
        </div>

        {/* Bio */}
        <div>
          <label className="block text-sm font-semibold text-theme-primary mb-2">Bio</label>
          <textarea
            value={formData.bio}
            onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
            placeholder="Tell us about yourself..."
            rows={4}
            className="w-full px-4 py-3 bg-white border border-stone-300 rounded-xl text-stone-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-tribe-green resize-none"
          />
        </div>

        {/* Photos */}

        {/* Emergency Contact */}
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
          <h3 className="text-sm font-bold text-theme-primary mb-3 flex items-center gap-2">
            🚨 Emergency Contact (Optional but Recommended)
          </h3>
          <p className="text-xs text-stone-600 dark:text-gray-400 mb-4">
            {language === 'es' 
              ? 'Información de contacto de emergencia en caso de accidente durante una sesión'
              : 'Emergency contact information in case of an incident during a session'}
          </p>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-theme-primary mb-2">
                {language === 'es' ? 'Nombre de Contacto' : 'Contact Name'}
              </label>
              <input
                type="text"
                value={formData.emergency_contact_name}
                onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                placeholder={language === 'es' ? 'ej. Juan Pérez' : 'e.g. John Smith'}
                className="w-full px-4 py-3 bg-white dark:bg-[#52575D] border border-stone-300 dark:border-gray-600 rounded-xl text-theme-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-tribe-green"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-theme-primary mb-2">
                {language === 'es' ? 'Teléfono de Contacto' : 'Contact Phone'}
              </label>
              <input
                type="tel"
                value={formData.emergency_contact_phone}
                onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                placeholder={language === 'es' ? 'ej. +57 300 123 4567' : 'e.g. +1 (555) 123-4567'}
                className="w-full px-4 py-3 bg-white dark:bg-[#52575D] border border-stone-300 dark:border-gray-600 rounded-xl text-theme-primary placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-tribe-green"
              />
            </div>
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-theme-primary mb-3">
            Photos ({formData.photos.length}/6)
          </label>
          <div className="grid grid-cols-3 gap-3">
            {formData.photos.map((photo, index) => (
              <div key={index} className="relative aspect-square">
                <img
                  src={photo}
                  alt={`Photo ${index + 1}`}
                  className="w-full h-full object-cover rounded-lg"
                />
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
                <span className="text-xs text-stone-500">Add Photo</span>
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
          <label className="block text-sm font-semibold text-theme-primary mb-3">Sports & Activities</label>
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
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
    </div>
  );
}
