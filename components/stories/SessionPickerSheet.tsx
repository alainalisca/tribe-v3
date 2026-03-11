'use client';

import { X, MapPin, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sportTranslations } from '@/lib/translations';
import type { ActiveSession } from './storyTypes';
import { getSportEmoji } from './storiesRowHelpers';

interface SessionPickerSheetProps {
  language: string;
  activeSessions: ActiveSession[];
  onSelectSession: (sessionId: string) => void;
  onClose: () => void;
}

export default function SessionPickerSheet({
  language,
  activeSessions,
  onSelectSession,
  onClose,
}: SessionPickerSheetProps) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#2C3137] w-full sm:max-w-md sm:rounded-xl rounded-t-2xl max-h-[70vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-stone-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-theme-primary">
            {language === 'es' ? 'Elegir Sesi\u00f3n' : 'Choose Session'}
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="w-5 h-5 text-theme-primary" />
          </Button>
        </div>
        <div className="p-2">
          {activeSessions.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelectSession(s.id)}
              className="w-full flex items-center gap-3 p-3 hover:bg-stone-100 dark:hover:bg-[#3D4349] rounded-xl transition"
            >
              <div className="w-10 h-10 bg-stone-100 dark:bg-[#3D4349] rounded-full flex items-center justify-center text-lg">
                {getSportEmoji(s.sport)}
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="font-semibold text-theme-primary text-sm">
                  {language === 'es' ? sportTranslations[s.sport]?.es || s.sport : s.sport}
                </div>
                <div className="flex items-center gap-2 text-xs text-theme-secondary">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(s.date + 'T00:00:00').toLocaleDateString(language === 'es' ? 'es-CO' : 'en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  {s.location && (
                    <span className="flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{s.location}</span>
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
