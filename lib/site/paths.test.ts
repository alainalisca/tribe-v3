import { describe, it, expect } from 'vitest';
import { internalSitePath, isSiteCardPath, publicPathForInternal, siteCardPath, siteSlugOf } from './paths';

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

  it("serves every /deportes/<word>/ as a site page; an unknown sport is the page route's 404 (T-SHARE1)", () => {
    expect(siteSlugOf('/deportes/boxeo/')).toBe('deportes/boxeo');
    expect(siteSlugOf('/deportes/funcional')).toBe('deportes/funcional');
    expect(siteSlugOf('/deportes/curling/')).toBe('deportes/curling');
    expect(siteSlugOf('/deportes/boxeo/x/')).toBeNull();
    expect(siteSlugOf('/deportes/Boxeo/')).toBeNull();
    expect(internalSitePath('deportes/mma', 'en')).toBe('/sitio/en/deportes/mma/');
    expect(publicPathForInternal('/sitio/es/deportes/yoga/')).toBe('/deportes/yoga/');
  });

  it("names a page's share card with the trailing slash, and lets only that through under /sitio (T-SHARE1)", () => {
    expect(siteCardPath('', 'es')).toBe('/sitio/es/card/');
    expect(siteCardPath('deportes/boxeo', 'en')).toBe('/sitio/en/deportes/boxeo/card/');
    expect(isSiteCardPath('/sitio/es/card/')).toBe(true);
    expect(isSiteCardPath('/sitio/en/coaches/card/')).toBe(true);
    expect(isSiteCardPath('/sitio/es/deportes/boxeo/card')).toBe(true);
    expect(isSiteCardPath('/sitio/es/coaches/')).toBe(false);
    expect(isSiteCardPath('/sitio/fr/card/')).toBe(false);
    expect(isSiteCardPath('/coaches/card/')).toBe(false);
    expect(isSiteCardPath('/sitio/es/card/x/')).toBe(false);
  });
});
