import { baseEn, baseEs } from './translationBase';
import { extEn, extEs } from './translationExtras';

export type Language = 'en' | 'es';

export const translations = {
  en: { ...baseEn, ...extEn },
  es: { ...baseEs, ...extEs },
};

export type TranslationKey = keyof typeof translations.en;
export { sportTranslations } from './sportTranslationData';
