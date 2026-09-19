/**
 * T-AUD21: the storefront preview caption shipped a literal placeholder.
 *
 * Onboarding step 2 read "This is how your storefront looks at
 * /storefront/your-id" with `your-id` rendered verbatim to the instructor.
 * The same sentence existed a second time in app/profile/edit/page.tsx, which
 * the original ticket did not know about; each site has its own test so fixing
 * one cannot make the other look covered.
 *
 * SOURCE assertion, not a render assertion: the string is a member of a large
 * translation object built inside the page component, and the defect is the
 * literal itself, not any branch that selects it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'app/onboarding/instructor/page.tsx'), 'utf8');

// Only the shipped strings, so the comment explaining the history does not
// itself satisfy or break the assertion.
const STRINGS = SRC.split('\n')
  .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
  .join('\n');

describe('T-AUD21 onboarding preview caption', () => {
  it('ships no your-id placeholder', () => {
    expect(STRINGS).not.toContain('your-id');
  });

  it('ships no tu-id placeholder', () => {
    expect(STRINGS).not.toContain('tu-id');
  });

  it('still tells the instructor what the preview is', () => {
    expect(STRINGS).toContain('This is how your storefront looks');
    expect(STRINGS).toContain('Así se verá tu vitrina');
  });
});
