'use client';

import { useLanguage } from '@/lib/LanguageContext';
import { sportTranslations } from '@/lib/translations';
import LocationPicker from '@/components/LocationPicker';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { getTrainingNowTexts } from './trainingNow/trainingNowTranslations';
import { useTrainingNowForm } from './trainingNow/useTrainingNowForm';

interface TrainingNowModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionCreated: () => void;
  userId: string;
}

export default function TrainingNowModal({ isOpen, onClose, onSessionCreated, userId }: TrainingNowModalProps) {
  const { language } = useLanguage();

  const { loading, gettingLocation, formData, setFormData, getCurrentLocation, handleSubmit } = useTrainingNowForm({
    isOpen,
    userId,
    language,
    onSessionCreated,
    onClose,
  });

  const sports = Object.keys(sportTranslations).filter((s) => s !== 'All');

  const getTranslatedSport = (sport: string) => {
    if (sportTranslations[sport]) {
      return sportTranslations[sport][language];
    }
    return sport;
  };

  if (!isOpen) return null;

  const txt = getTrainingNowTexts(language);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        data-modal="true"
        className="max-w-md rounded-2xl p-0 max-h-[80vh] flex flex-col dark:bg-[#404549] gap-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-200 dark:border-gray-600 flex-shrink-0">
          <DialogTitle className="text-lg font-bold text-theme-primary">{txt.title}</DialogTitle>
        </div>

        <div className="p-4 space-y-5 overflow-y-auto flex-1">
          {/* Sport Selection */}
          <div>
            <label className="block text-sm font-medium text-theme-primary mb-2">{txt.whatTraining}</label>
            <div className="flex flex-wrap gap-2">
              {sports.slice(0, 12).map((sport) => (
                <button
                  key={sport}
                  onClick={() => setFormData({ ...formData, sport })}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                    formData.sport === sport
                      ? 'bg-tribe-green text-slate-900'
                      : 'bg-stone-100 dark:bg-tribe-mid text-theme-secondary hover:bg-stone-200'
                  }`}
                >
                  {getTranslatedSport(sport)}
                </button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-theme-primary mb-2">{txt.where}</label>
            <button
              onClick={getCurrentLocation}
              disabled={gettingLocation}
              className="w-full mb-2 py-2 px-4 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition disabled:opacity-50"
            >
              {gettingLocation ? txt.gettingLocation : txt.useLocation}
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
              placeholder={txt.locationPlaceholder}
            />
          </div>

          {/* Start Time */}
          <div>
            <label className="block text-sm font-medium text-theme-primary mb-2">{txt.when}</label>
            <div className="flex gap-2">
              {[
                { value: 0, label: txt.now },
                { value: 30, label: txt.min30 },
                { value: 60, label: txt.hour1 },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFormData({ ...formData, startIn: option.value })}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium transition ${
                    formData.startIn === option.value
                      ? 'bg-tribe-green text-slate-900'
                      : 'bg-stone-100 dark:bg-tribe-mid text-theme-secondary hover:bg-stone-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-theme-primary mb-2">{txt.howLong}</label>
            <div className="flex gap-2">
              {[
                { value: 30, label: txt.min30dur },
                { value: 60, label: txt.hour1dur },
                { value: 90, label: txt.hour15dur },
                { value: 120, label: txt.hour2dur },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFormData({ ...formData, duration: option.value })}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium transition ${
                    formData.duration === option.value
                      ? 'bg-tribe-green text-slate-900'
                      : 'bg-stone-100 dark:bg-tribe-mid text-theme-secondary hover:bg-stone-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sticky Submit Button */}
        <div className="p-4 border-t border-stone-200 dark:border-gray-600 flex-shrink-0 bg-white dark:bg-[#404549]">
          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={loading || !formData.sport || !formData.location}
            className="w-full py-4 bg-tribe-green text-slate-900 font-bold rounded-xl hover:bg-lime-500 transition disabled:opacity-50 disabled:cursor-not-allowed text-lg"
          >
            {loading ? txt.creating : txt.notify}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
