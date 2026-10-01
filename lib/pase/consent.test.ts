/**
 * T-AV23: the attributed consent sentence (D12, wording approved 2026-09-30),
 * reworded in T-AV27a (Al, 2026-10-01) so it covers joining.
 *
 * Literal expected strings, not the constants re-assembled: a test that
 * builds its expectation from the code under test agrees with any change.
 */
import { describe, it, expect } from 'vitest';
import { CONSENT_TEXT_V1, consentTextFor, consentTextForAttributed } from './consent';

describe('consentTextForAttributed', () => {
  it('BullBox (Prueba), invited by Ana: V1 plus the attributed line, 267 characters', () => {
    const text = consentTextForAttributed('BullBox (Prueba)', 'Ana');
    expect(text).toBe(
      'Autorizo a Tribe a compartir mi nombre, WhatsApp y correo con BullBox (Prueba) para que me contacte sobre mi clase gratis. ' +
        'Mi primer nombre, si asistí a mi clase y si me inscribí se compartirán con Ana, quien me invitó. ' +
        'BullBox (Prueba) y Tribe registrarán si asistí.'
    );
    expect(text?.length).toBe(267);
  });

  it('the other two measured examples: 249 and 273 characters', () => {
    expect(consentTextForAttributed('BullBox', 'Ana')?.length).toBe(249);
    expect(consentTextForAttributed('CrossFit BullBox', 'Alejandra')?.length).toBe(273);
  });

  it('starts with exactly what an unattributed lead signs', () => {
    expect(consentTextForAttributed('BullBox', 'Ana')?.startsWith(CONSENT_TEXT_V1 + ' ')).toBe(true);
    expect(consentTextForAttributed('Otro Gym', 'Ana')?.startsWith(consentTextFor('Otro Gym') + ' ')).toBe(true);
  });

  it('is null at 501 characters and a string at 500 (the pass_leads CHECK)', () => {
    // Fixed part is 232 characters; the gym name appears twice.
    const at500 = consentTextForAttributed('G'.repeat(133), 'A'.repeat(2));
    expect(at500?.length).toBe(500);
    expect(consentTextForAttributed('G'.repeat(133), 'A'.repeat(3))).toBeNull();
  });

  it('leaves V1 itself untouched (rows already written keep what their signer saw)', () => {
    expect(CONSENT_TEXT_V1).toBe(
      'Autorizo a Tribe a compartir mi nombre, WhatsApp y correo con BullBox para que me contacte sobre mi clase gratis.'
    );
  });
});
