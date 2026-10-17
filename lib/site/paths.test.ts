import { describe, it, expect } from 'vitest';
import { internalSitePath, publicPathForInternal, siteSlugOf } from './paths';

describe('site paths (T-SITE1)', () => {
  it('knows the site pages, with or without the trailing slash', () => {
    expect(siteSlugOf('/')).toBe('');
    expect(siteSlugOf('/coaches')).toBe('coaches');
    expect(siteSlugOf('/tribe-os/')).toBe('tribe-os');
    expect(siteSlugOf('/coaches/x')).toBeNull();
    expect(siteSlugOf('/os/coaches')).toBeNull();
    expect(siteSlugOf('/atletas/')).toBeNull();
    expect(siteSlugOf('/tvshows')).toBeNull();
  });

  it('maps a page and a language to its prerendered route', () => {
    expect(internalSitePath('', 'es')).toBe('/sitio/es/');
    expect(internalSitePath('tv', 'en')).toBe('/sitio/en/tv/');
  });

  it('sends an internal URL back to its public path', () => {
    expect(publicPathForInternal('/sitio/en/tv/')).toBe('/tv/');
    expect(publicPathForInternal('/sitio/es/')).toBe('/');
    expect(publicPathForInternal('/sitio')).toBe('/');
    expect(publicPathForInternal('/sitio/fr/nope/')).toBe('/');
    expect(publicPathForInternal('/sitios/')).toBeNull();
    expect(publicPathForInternal('/coaches/')).toBeNull();
  });
});
