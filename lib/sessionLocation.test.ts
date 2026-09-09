import { describe, it, expect } from 'vitest';
import { dedupeLocationSegments, formatSessionLocation, formatSessionLocationShort } from './sessionLocation';

// El Poblado, so the coord-based fallbacks resolve to a real neighborhood.
const POBLADO = { lat: 6.2088, lng: -75.5648 };

describe('dedupeLocationSegments', () => {
  it('collapses the repeated barrio and city Google returns', () => {
    expect(
      dedupeLocationSegments('Cl. 20 #43g - 155, El Poblado, Medellín, El Poblado, Medellín, Antioquia, Colombia')
    ).toBe('Cl. 20 #43g - 155, El Poblado, Medellín, Antioquia, Colombia');
  });

  it('leaves a clean string alone', () => {
    expect(dedupeLocationSegments('Parque Lleras, El Poblado, Medellín')).toBe('Parque Lleras, El Poblado, Medellín');
  });

  it('ignores case and accents when comparing', () => {
    expect(dedupeLocationSegments('Cra 43, El poblado, Medellin, El Poblado, Medellín')).toBe(
      'Cra 43, El poblado, Medellin'
    );
  });

  it('drops empty segments and handles nullish input', () => {
    expect(dedupeLocationSegments('Cra 43, , El Poblado,')).toBe('Cra 43, El Poblado');
    expect(dedupeLocationSegments(null)).toBe('');
    expect(dedupeLocationSegments(undefined)).toBe('');
  });
});

describe('formatSessionLocationShort', () => {
  it('shortens the observed BullBox address to street plus barrio', () => {
    expect(
      formatSessionLocationShort(
        'Cl. 20 #43g - 155, El Poblado, Medellín, El Poblado, Medellín, Antioquia, Colombia',
        POBLADO.lat,
        POBLADO.lng,
        'es'
      )
    ).toBe('Cl. 20 #43g - 155, El Poblado');
  });

  it('keeps a clean short string as-is', () => {
    expect(formatSessionLocationShort('Parque Lleras, El Poblado', POBLADO.lat, POBLADO.lng, 'en')).toBe(
      'Parque Lleras, El Poblado'
    );
  });

  it('never renders raw coordinates, falling back to the neighborhood', () => {
    const result = formatSessionLocationShort('6.220661, -75.573718', POBLADO.lat, POBLADO.lng, 'en');
    expect(result).not.toMatch(/-?\d+\.\d+/);
    expect(result.length).toBeGreaterThan(0);
  });

  it('falls back when the address is nothing but city, department and country', () => {
    const result = formatSessionLocationShort('Medellín, Antioquia, Colombia', POBLADO.lat, POBLADO.lng, 'en');
    expect(result).not.toContain('Colombia');
    expect(result).not.toContain('Antioquia');
  });

  it('says so, in the active language, when there is nothing to show', () => {
    expect(formatSessionLocationShort('', null, null, 'en')).toBe('Location not specified');
    expect(formatSessionLocationShort(null, null, null, 'es')).toBe('Ubicación no especificada');
  });

  it('matches the barrio despite differing case and accents', () => {
    expect(formatSessionLocationShort('Cra 43, el poblado, Medellin', POBLADO.lat, POBLADO.lng, 'en')).toBe(
      'Cra 43, el poblado'
    );
  });

  it('leaves the full formatter untouched for the detail page', () => {
    const full = 'Cl. 20 #43g - 155, El Poblado, Medellín, El Poblado, Medellín, Antioquia, Colombia';
    expect(formatSessionLocation(full, POBLADO.lat, POBLADO.lng, 'es')).toBe(full);
  });
});
