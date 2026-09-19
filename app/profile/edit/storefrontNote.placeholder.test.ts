/**
 * T-AUD21, second site. See app/onboarding/instructor/previewNote.placeholder.test.ts.
 *
 * The original ticket named only the onboarding caption. This copy of the same
 * sentence was found while verifying it, and is the reason the fix is two edits
 * rather than one. Its own test, so neither site can be closed by the other.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'app/profile/edit/page.tsx'), 'utf8');

const STRINGS = SRC.split('\n')
  .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
  .join('\n');

describe('T-AUD21 profile edit storefront note', () => {
  it('ships no your-id placeholder', () => {
    expect(STRINGS).not.toContain('your-id');
  });

  it('ships no tu-id placeholder', () => {
    expect(STRINGS).not.toContain('tu-id');
  });

  it('still explains what the storefront is', () => {
    expect(STRINGS).toContain('Your storefront is your public page');
  });
});
