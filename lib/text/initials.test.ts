/**
 * T-AV28. Mutation proof: take `word[0]` instead of the first letter ->
 * "BullBox (Prueba) is BP, not B(" goes red.
 */
import { describe, it, expect } from 'vitest';
import { initialsOf } from './initials';

describe('initialsOf', () => {
  it('BullBox (Prueba) is BP, not B(', () => {
    expect(initialsOf('BullBox (Prueba)')).toBe('BP');
  });

  it('letters only, first of up to two words', () => {
    expect(initialsOf('CrossFit BullBox Medellín')).toBe('CB');
    expect(initialsOf('Fruta Vida')).toBe('FV');
    expect(initialsOf('"Otro" Gym')).toBe('OG');
    expect(initialsOf('Gym & Box')).toBe('GB');
    expect(initialsOf('Gym 24/7 Box')).toBe('GB');
    expect(initialsOf('  ñandú   óscar ')).toBe('ÑÓ');
    expect(initialsOf('Leo')).toBe('L');
  });

  it('a name with no letters is empty, never punctuation', () => {
    expect(initialsOf('(  )')).toBe('');
    expect(initialsOf('')).toBe('');
  });
});
