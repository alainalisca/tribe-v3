'use client';

import { useLanguage } from '@/lib/LanguageContext';

export default function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex flex-shrink-0 bg-stone-200 dark:bg-stone-700 rounded-full p-1">
      <button
        onClick={() => setLanguage('en')}
        aria-label={language === 'es' ? 'Switch to English' : 'English selected'}
        className={`px-3 py-1 rounded-full text-sm font-semibold transition-all ${
          language === 'en'
            ? 'bg-tribe-green text-stone-900'
            : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
        }`}
      >
        EN
      </button>
      <button
        onClick={() => setLanguage('es')}
        aria-label={language === 'en' ? 'Cambiar a Español' : 'Español seleccionado'}
        className={`px-3 py-1 rounded-full text-sm font-semibold transition-all ${
          language === 'es'
            ? 'bg-tribe-green text-stone-900'
            : 'text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
        }`}
      >
        ES
      </button>
    </div>
  );
}
