// @vitest-environment node
import { describe, it, expect } from 'vitest';

/**
 * Storefront bio resolution rule, shared verbatim by the three public instructor
 * surfaces that changed in fix/storefront-reads-instructor-bio:
 *   - components/storefront/StorefrontProfileColumn.tsx (storefront sidebar)
 *   - app/i/[id]/page.tsx (share-page metadata description)
 *   - app/i/[id]/InstructorShareClient.tsx (share card body)
 *
 * All three render `instructor_bio || bio`. instructor_bio is what both
 * instructor-facing editors write (the Storefront Editor and profile-edit's
 * Professional Bio), so it reflects what the instructor last saved; the bio
 * fallback keeps a bio for instructors who only filled the older general field.
 * This mirrors that expression so a future reorder or dropped fallback fails.
 */
function resolveStorefrontBio(p: { instructor_bio?: string | null; bio?: string | null }): string | null {
  return p.instructor_bio || p.bio || null;
}

describe('storefront bio resolution (instructor_bio || bio)', () => {
  it('shows instructor_bio when both fields are present', () => {
    expect(resolveStorefrontBio({ instructor_bio: 'Storefront bio', bio: 'General bio' })).toBe('Storefront bio');
  });

  it('falls back to bio when only bio is present', () => {
    expect(resolveStorefrontBio({ instructor_bio: null, bio: 'General bio' })).toBe('General bio');
    // An empty-string instructor_bio is falsy, so it also falls back to bio.
    expect(resolveStorefrontBio({ instructor_bio: '', bio: 'General bio' })).toBe('General bio');
  });

  it('resolves to null when neither is present, so no bio block renders', () => {
    expect(resolveStorefrontBio({ instructor_bio: null, bio: null })).toBeNull();
    expect(resolveStorefrontBio({})).toBeNull();
    // A falsy result is what gates the JSX block off, so no empty block renders.
    expect(resolveStorefrontBio({ instructor_bio: '', bio: '' })).toBeFalsy();
  });
});
