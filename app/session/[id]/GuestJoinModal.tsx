'use client';

import { X } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

interface GuestJoinModalProps {
  language: 'en' | 'es';
  guestData: { name: string; phone: string; email: string };
  joiningAsGuest: boolean;
  onClose: () => void;
  onGuestDataChange: (data: { name: string; phone: string; email: string }) => void;
  onSubmit: () => void;
}

export default function GuestJoinModal({
  language: _language,
  guestData,
  joiningAsGuest,
  onClose,
  onGuestDataChange,
  onSubmit,
}: GuestJoinModalProps) {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#6B7178] rounded-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-theme-primary">{t('joinAsGuest')}</h3>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 dark:hover:bg-[#52575D] rounded">
            <X className="w-5 h-5 text-theme-primary" />
          </button>
        </div>
        <p className="text-sm text-stone-600 dark:text-gray-300 mb-4">{t('enterDetailsToConfirm')}</p>
        <div className="space-y-3">
          <input
            type="text"
            placeholder={t('fullName')}
            value={guestData.name}
            onChange={(e) => onGuestDataChange({ ...guestData, name: e.target.value })}
            className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-theme-primary"
          />
          <input
            type="tel"
            placeholder={t('phone')}
            value={guestData.phone}
            onChange={(e) => onGuestDataChange({ ...guestData, phone: e.target.value })}
            className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-theme-primary"
          />
          <input
            type="email"
            placeholder={t('emailOptional')}
            value={guestData.email}
            onChange={(e) => onGuestDataChange({ ...guestData, email: e.target.value })}
            className="w-full px-4 py-3 border border-stone-300 dark:border-[#52575D] rounded-lg bg-white dark:bg-[#52575D] text-theme-primary"
          />
        </div>
        <button
          onClick={onSubmit}
          disabled={joiningAsGuest}
          className="w-full mt-4 py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 disabled:opacity-50"
        >
          {joiningAsGuest ? t('confirming') : t('confirmAttendance')}
        </button>
        <p className="text-xs text-center text-stone-500 dark:text-gray-400 mt-3">
          {t('alreadyHaveAccount')}{' '}
          <a href="/auth" className="text-tribe-green hover:underline">
            {t('signInLink')}
          </a>
        </p>
      </div>
    </div>
  );
}
