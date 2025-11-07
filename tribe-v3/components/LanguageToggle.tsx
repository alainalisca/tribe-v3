'use client';

import { useLanguage } from '@/lib/LanguageContext';

export default function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <button
      onClick={() => setLanguage(language === 'en' ? 'es' : 'en')}
      className="px-3 py-1.5 bg-stone-200 rounded-lg text-sm font-semibold text-stone-700 hover:bg-stone-300 transition"
    >
      {language === 'en' ? 'ES' : 'EN'}
    </button>
  );
}
