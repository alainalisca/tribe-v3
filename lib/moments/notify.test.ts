import { describe, it, expect } from 'vitest';
import { momentsMessage } from './notify';

describe('momentsMessage (T-MOM1)', () => {
  it('one line, singular and plural, in both languages', () => {
    expect(momentsMessage(6, 'Boxeo con Salomon', 'es')).toBe('Tienes 6 fotos nuevas de Boxeo con Salomon');
    expect(momentsMessage(1, 'Boxeo con Salomon', 'es')).toBe('Tienes 1 foto nueva de Boxeo con Salomon');
    expect(momentsMessage(2, 'Boxing with Salomon', 'en')).toBe('You have 2 new photos from Boxing with Salomon');
  });
});
