/**
 * T-PROF1: instructor profile completeness.
 *
 * An instructor is shown on the "Train with an Instructor" discover page (and
 * in sport-matching results) only once all five required fields are present.
 * While any is missing they are hidden and prompted to finish their profile.
 *
 * Rules (confirmed with Al):
 *  - photo:            avatar_url OR the first photos[] entry is non-empty
 *  - bio:              instructor_bio OR bio is non-empty (matches the storefront)
 *  - specialties:      at least one entry
 *  - location:         the `location` TEXT field is non-empty (coords don't count)
 *  - years_experience: set AND greater than 0
 *
 * Pure and dependency-free so it can be reused by the DAL filter, the dashboard
 * banner, and unit tests.
 */

export const REQUIRED_INSTRUCTOR_FIELDS = ['photo', 'bio', 'specialties', 'location', 'years_experience'] as const;

export type InstructorField = (typeof REQUIRED_INSTRUCTOR_FIELDS)[number];

/** Minimal shape needed to judge completeness; a superset of columns is fine. */
export interface InstructorProfileFields {
  avatar_url?: string | null;
  photos?: string[] | null;
  bio?: string | null;
  instructor_bio?: string | null;
  specialties?: string[] | null;
  location?: string | null;
  years_experience?: number | null;
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasPhoto(p: InstructorProfileFields): boolean {
  return hasText(p.avatar_url) || (Array.isArray(p.photos) && p.photos.some(hasText));
}

function hasBio(p: InstructorProfileFields): boolean {
  return hasText(p.instructor_bio) || hasText(p.bio);
}

function hasSpecialty(p: InstructorProfileFields): boolean {
  return Array.isArray(p.specialties) && p.specialties.some(hasText);
}

function hasLocation(p: InstructorProfileFields): boolean {
  return hasText(p.location);
}

function hasYearsExperience(p: InstructorProfileFields): boolean {
  return typeof p.years_experience === 'number' && p.years_experience > 0;
}

/**
 * The required fields still missing from the profile, in display order.
 * Empty array means the profile is complete.
 */
export function getMissingInstructorFields(p: InstructorProfileFields): InstructorField[] {
  const missing: InstructorField[] = [];
  if (!hasPhoto(p)) missing.push('photo');
  if (!hasBio(p)) missing.push('bio');
  if (!hasSpecialty(p)) missing.push('specialties');
  if (!hasLocation(p)) missing.push('location');
  if (!hasYearsExperience(p)) missing.push('years_experience');
  return missing;
}

/** True when all five required instructor fields are present. */
export function isInstructorProfileComplete(p: InstructorProfileFields): boolean {
  return getMissingInstructorFields(p).length === 0;
}
