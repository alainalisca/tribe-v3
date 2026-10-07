/**
 * T-AV27b: the server-side translate resolves exactly as useTranslations does,
 * and refuses rather than sending a key to someone's phone.
 * Mutation proof: return the key instead of throwing -> "an unresolvable key throws" RED.
 */
import { describe, it, expect } from 'vitest';
import { toLanguage, translate } from './translate';

describe('translate', () => {
  it('reads messages/*.json with {name} interpolation, in either language', () => {
    expect(translate('es', 'notify', 'arrived', { guest: 'Laura' })).toBe('Laura llegó a su clase');
    expect(translate('en', 'notify', 'joined', { guest: 'Laura', gym: 'BullBox' })).toBe('Laura joined BullBox');
    expect(translate('es', 'email', 'invitedBy', { athlete: 'Ana' })).toBe('Invitación de Ana');
  });

  it('an unresolvable key throws', () => {
    expect(() => translate('es', 'notify', 'nope')).toThrow('es notify.nope does not resolve');
    expect(() => translate('es', 'nonamespace', 'x')).toThrow();
  });

  it('a stored preference maps to en or es; anything else is Spanish', () => {
    expect(toLanguage('en')).toBe('en');
    expect(toLanguage('es')).toBe('es');
    expect(toLanguage(null)).toBe('es');
    expect(toLanguage('fr')).toBe('es');
  });
});
