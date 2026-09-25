import { describe, it, expect } from 'vitest';
import { typedNameMatches } from './communityDeleteConfirm';

describe('typed-name confirmation matches the server rule', () => {
  it('an exact match enables delete', () => {
    expect(typedNameMatches('Runners Laureles', 'Runners Laureles')).toBe(true);
  });

  // The server btrims both sides; a stray space from autocomplete must not
  // refuse a valid confirmation (rehearsal arm D1).
  it('surrounding spaces are ignored, as on the server', () => {
    expect(typedNameMatches('  Runners Laureles ', 'Runners Laureles')).toBe(true);
  });

  // The server compares case-sensitively (rehearsal arm C11), so the browser
  // must too, or the button enables for a name the database refuses.
  it('a different case does not match', () => {
    expect(typedNameMatches('runners laureles', 'Runners Laureles')).toBe(false);
  });

  it('a partial name does not match', () => {
    expect(typedNameMatches('Runners', 'Runners Laureles')).toBe(false);
  });

  it('an empty or blank entry never matches, even a blank name', () => {
    expect(typedNameMatches('', 'Runners Laureles')).toBe(false);
    expect(typedNameMatches('   ', '   ')).toBe(false);
  });
});
