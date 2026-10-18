import { describe, it, expect } from 'vitest';
import { languageCookieString, languageFromCookie, readLanguageCookie, serverLanguage } from './languageCookie';

describe('tribe_lang cookie (T-SITE1)', () => {
  it('is Spanish unless it says English', () => {
    expect(languageFromCookie('en')).toBe('en');
    expect(languageFromCookie('es')).toBe('es');
    expect(languageFromCookie(undefined)).toBe('es');
    expect(languageFromCookie('fr')).toBe('es');
  });

  it('reads the value out of document.cookie', () => {
    expect(readLanguageCookie('a=1; tribe_lang=en; b=2')).toBe('en');
    expect(readLanguageCookie('tribe_lang=es')).toBe('es');
    expect(readLanguageCookie('x_tribe_lang=en')).toBeNull();
    expect(readLanguageCookie('tribe_lang=fr')).toBeNull();
    expect(readLanguageCookie('')).toBeNull();
  });

  it('is written site wide for a year', () => {
    expect(languageCookieString('en')).toBe('tribe_lang=en; Path=/; Max-Age=31536000; SameSite=Lax');
  });

  it('server render (T-SSR1): cookie, then Accept-Language, then Spanish', () => {
    expect(serverLanguage('en', 'es-CO,es;q=0.9')).toBe('en');
    expect(serverLanguage('es', 'en-US')).toBe('es');
    expect(serverLanguage(undefined, 'en-US,en;q=0.9,es;q=0.8')).toBe('en');
    expect(serverLanguage('fr', 'es-CO')).toBe('es');
    expect(serverLanguage(undefined, 'fr-FR,de;q=0.9,en;q=0.5')).toBe('en');
    expect(serverLanguage(undefined, 'fr-FR')).toBe('es');
    expect(serverLanguage(undefined, null)).toBe('es');
  });
});
