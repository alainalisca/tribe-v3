/**
 * The upload_photo message must not assert a cause it never checked.
 *
 * It claimed "the file may be too large" for any thrown error on seven call
 * sites, none of which checks file size. On 2026-09-11 a Supabase Storage
 * failure -- most likely an expired session on a preview origin -- surfaced as
 * a size complaint and sent a real investigation after a problem that did not
 * exist.
 */
import { describe, it, expect } from 'vitest';
import { getErrorMessage } from './errorMessages';

describe('upload_photo copy', () => {
  it('does not blame file size in either language', () => {
    for (const lang of ['en', 'es'] as const) {
      const message = getErrorMessage(new Error('new row violates row-level security policy'), 'upload_photo', lang);
      expect(message.toLowerCase()).not.toContain('large');
      expect(message.toLowerCase()).not.toContain('grande');
      expect(message.toLowerCase()).not.toContain('tamaño');
    }
  });

  it('still says something useful rather than nothing', () => {
    for (const lang of ['en', 'es'] as const) {
      expect(getErrorMessage(new Error('boom'), 'upload_photo', lang).length).toBeGreaterThan(10);
    }
  });
});
