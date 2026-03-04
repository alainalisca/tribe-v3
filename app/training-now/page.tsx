/** Page: /training-now — Find and join live training sessions nearby */
'use client';

import { ArrowLeft, Navigation } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';
import BottomNav from '@/components/BottomNav';
import LocationPicker from '@/components/LocationPicker';
import Link from 'next/link';
import { getTrainingNowTranslations } from './translations';
import { useTrainingNow } from './useTrainingNow';

export default function TrainingNowPage() {
  const { language } = useLanguage();
  const txt = getTrainingNowTranslations(language);
  const { user, loading, gettingLocation, formData, setFormData, getCurrentLocation, handleSubmit } =
    useTrainingNow(language);

  const sports = Object.keys(sportTranslations).filter((s) => s !== 'All');

  const getTranslatedSport = (sport: string) => {
    if (language === 'es' && sportTranslations[sport]?.es) {
      return sportTranslations[sport].es;
    }
    return sport;
  };

  const startOptions = [
    { value: 0, label: txt.now },
    { value: 30, label: '30 min' },
    { value: 60, label: '1 hour' },
  ];

  const durationOptions = [
    { value: 30, label: '30 min' },
    { value: 60, label: '1 hour' },
    { value: 90, label: '1.5 hrs' },
    { value: 120, label: '2 hours' },
  ];

  if (!user) return null;

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-[#404549] pb-32">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-tribe-green border-b border-lime-600">
        <div className="max-w-2xl mx-auto h-14 flex items-center gap-3 px-4">
          <Link href="/">
            <button className="p-2 hover:bg-lime-500 rounded-full transition">
              <ArrowLeft className="w-6 h-6 text-slate-900" />
            </button>
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">{txt.title}</h1>
        </div>
      </div>

      <div className="pt-header max-w-2xl mx-auto p-4 space-y-6">
        {/* Sport Selection */}
        <div>
          <label className="block text-sm font-bold text-stone-800 dark:text-white mb-3">{txt.whatTraining}</label>
          <div className="flex flex-wrap gap-2">
            {sports.map((sport) => (
              <button
                key={sport}
                onClick={() => setFormData({ ...formData, sport })}
                className={`px-4 py-2.5 rounded-full text-sm font-semibold transition ${
                  formData.sport === sport
                    ? 'bg-tribe-green text-slate-900'
                    : 'bg-white dark:bg-[#6B7178] text-stone-700 dark:text-white border border-stone-300 dark:border-transparent hover:bg-stone-100 dark:hover:bg-[#7B8188]'
                }`}
              >
                {getTranslatedSport(sport)}
              </button>
            ))}
          </div>
        </div>

        {/* Location with autocomplete */}
        <div>
          <label className="block text-sm font-bold text-stone-800 dark:text-white mb-3">{txt.where}</label>
          <button
            onClick={getCurrentLocation}
            disabled={gettingLocation}
            className="w-full py-3 px-4 bg-tribe-green/20 text-tribe-green rounded-xl flex items-center justify-center gap-2 mb-3 font-semibold hover:bg-tribe-green/30 transition"
          >
            <Navigation className="w-5 h-5" />
            {gettingLocation ? '...' : txt.useLocation}
          </button>
          <LocationPicker
            value={formData.location}
            onChange={(location, coords) => {
              setFormData((prev) => ({
                ...prev,
                location,
                latitude: coords?.lat ?? prev.latitude,
                longitude: coords?.lng ?? prev.longitude,
              }));
            }}
            placeholder={language === 'es' ? 'ej. Parque Lleras' : 'e.g. Central Park'}
          />
        </div>

        {/* When Starting */}
        <div>
          <label className="block text-sm font-bold text-stone-800 dark:text-white mb-3">{txt.whenStarting}</label>
          <div className="grid grid-cols-3 gap-3">
            {startOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setFormData({ ...formData, startIn: option.value })}
                className={`py-3 rounded-xl font-semibold transition ${
                  formData.startIn === option.value
                    ? 'bg-tribe-green text-slate-900'
                    : 'bg-white dark:bg-[#6B7178] text-stone-700 dark:text-white border border-stone-300 dark:border-transparent'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div>
          <label className="block text-sm font-bold text-stone-800 dark:text-white mb-3">{txt.howLong}</label>
          <div className="grid grid-cols-4 gap-2">
            {durationOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setFormData({ ...formData, duration: option.value })}
                className={`py-3 rounded-xl font-semibold transition text-sm ${
                  formData.duration === option.value
                    ? 'bg-tribe-green text-slate-900'
                    : 'bg-white dark:bg-[#6B7178] text-stone-700 dark:text-white border border-stone-300 dark:border-transparent'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={loading || !formData.sport || !formData.location}
          className="w-full py-4 bg-tribe-green text-slate-900 font-bold rounded-xl hover:bg-lime-500 transition disabled:opacity-50 disabled:cursor-not-allowed text-lg"
        >
          {loading ? txt.creating : txt.notify}
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
