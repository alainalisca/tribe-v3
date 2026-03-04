/** Page: /profile/edit — Edit profile details, photos, sports, and emergency contact */
'use client';

import { SPORTS_LIST } from '@/lib/sports';
import { sportTranslations } from '@/lib/translations';
import { useLanguage } from '@/lib/LanguageContext';
import { ArrowLeft, Save, Upload, X, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEditProfile } from './useEditProfile';

export default function EditProfilePage() {
  const { language } = useLanguage();
  const getTranslatedSport = (sport: string) => (language === 'es' ? sportTranslations[sport]?.es || sport : sport);

  const {
    tr,
    loading,
    saving,
    uploadingPhoto,
    formData,
    setFormData,
    handlePhotoUpload,
    removePhoto,
    handleSave,
    toggleSport,
  } = useEditProfile(language);

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

        {/* Photos */}
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
