import { describe, it, expect } from 'vitest';
import { neighborhoodFromAddress } from './sessionLocation';

describe('neighborhoodFromAddress', () => {
  it('pulls the neighbourhood out of a full street address', () => {
    expect(neighborhoodFromAddress('Cra 43G #25a-50, El Poblado, Medellín')).toBe('El Poblado');
  });

  it('never returns a street, which reads as a bug on a tile', () => {
    // The whole point of the fallback: no recognised neighbourhood means no
    // line, not "Cra 43G #25a-50".
    expect(neighborhoodFromAddress('Cra 43G #25a-50')).toBeNull();
  });

  it('falls back to the city when no neighbourhood is recognised', () => {
    expect(neighborhoodFromAddress('Calle Falsa 123, Medellín')).toBe('Medellín');
  });

  it('returns null for an empty or missing address', () => {
    for (const input of [null, undefined, '', '   ']) {
      expect(neighborhoodFromAddress(input)).toBeNull();
    }
  });

  it('matches regardless of accent or case', () => {
    expect(neighborhoodFromAddress('Cra 1, el poblado, medellin')).toBe('El Poblado');
  });
});
