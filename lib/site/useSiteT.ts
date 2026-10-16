'use client';

/**
 * T-SITE1. The marketing site's translation hook.
 *
 * Same files and the same flat lookup as useTranslations (messages/{es,en}.json,
 * namespace "site.*"). It differs in ONE thing: the language it renders before
 * the page has mounted.
 *
 * LanguageProvider starts at 'en' and settles in an effect (stored choice, then
 * browser, then Spanish). On the app that is invisible behind the splash. On the
 * marketing pages it is not: they are prerendered, so the server HTML would be
 * English and flip to Spanish on hydration for most visitors -- a visible text
 * swap on the hero, and English HTML served to a Spanish-first market's
 * crawlers. So the site renders Spanish on the server AND on the hydrating
 * render (the two must match), and follows the provider from the first effect
 * onwards. The provider is not touched: changing its default would change every
 * app route's first frame.
 */
import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { siteMessage, type SiteLanguage } from '@/lib/site/messages';

const SUPPORTED: Record<string, SiteLanguage> = { es: 'es', en: 'en' };

export function useSiteLanguage(): SiteLanguage {
  const { language } = useLanguage();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return 'es';
  return SUPPORTED[language] ?? 'es';
}

export type SiteT = (key: string, vars?: Record<string, string | number>) => string;

export function useSiteT(namespace: string): SiteT {
  const language = useSiteLanguage();
  return (key, vars) => siteMessage(language, namespace, key, vars);
}
