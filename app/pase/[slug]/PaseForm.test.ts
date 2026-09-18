import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * A source assertion rather than a mounted test, because the defect is not in
 * what the component does with a response. It is in the URL it asks for, and a
 * mounted test with a mocked fetch would pass against either spelling.
 *
 * next.config sets trailingSlash: true, so '/api/pase' answers 308 to
 * '/api/pase/'. A 308 preserves the method and body and fetch follows it, so
 * the slashless form works and is invisible in every test and in most manual
 * checks. It just costs a round trip on the one submit that happens on gym
 * wifi with the person still standing there.
 *
 * Same shape as StorefrontEditor.callsite.test.ts: assert on the call site, in
 * source, when that is the layer the defect occupies.
 */
describe('PaseForm posts to the canonical URL', () => {
  const source = fs.readFileSync(path.join(__dirname, 'PaseForm.tsx'), 'utf-8');

  it('includes the trailing slash, so the submit is not a 308 followed by a POST', () => {
    expect(source).toContain("fetch('/api/pase/'");
  });

  it('does not post to the slashless form anywhere', () => {
    expect(source).not.toMatch(/fetch\('\/api\/pase'/);
  });
});
