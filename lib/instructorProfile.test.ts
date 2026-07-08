import { describe, it, expect } from 'vitest';
import {
  isInstructorProfileComplete,
  getMissingInstructorFields,
  type InstructorProfileFields,
} from './instructorProfile';

/**
 * T-PROF1: an instructor is discoverable only with all five required fields.
 * Rules: photo (avatar_url OR photos[]), bio (instructor_bio OR bio),
 * >=1 specialty, location text, years_experience > 0.
 */

const complete: InstructorProfileFields = {
  avatar_url: 'https://cdn/x.jpg',
  bio: 'I coach runners.',
  specialties: ['Running'],
  location: 'Medellín',
  years_experience: 5,
};

describe('isInstructorProfileComplete', () => {
  it('true when all five fields are present', () => {
    expect(isInstructorProfileComplete(complete)).toBe(true);
    expect(getMissingInstructorFields(complete)).toEqual([]);
  });

  it('photo satisfied by a photos[] entry when avatar_url is empty', () => {
    expect(isInstructorProfileComplete({ ...complete, avatar_url: null, photos: ['https://cdn/p.jpg'] })).toBe(true);
  });

  it('bio satisfied by instructor_bio when bio is empty', () => {
    expect(isInstructorProfileComplete({ ...complete, bio: null, instructor_bio: 'Storefront bio' })).toBe(true);
  });

  it('missing photo → incomplete', () => {
    const p = { ...complete, avatar_url: null, photos: null };
    expect(isInstructorProfileComplete(p)).toBe(false);
    expect(getMissingInstructorFields(p)).toContain('photo');
  });

  it('blank/whitespace bio → incomplete', () => {
    const p = { ...complete, bio: '   ', instructor_bio: '' };
    expect(getMissingInstructorFields(p)).toContain('bio');
  });

  it('empty specialties → incomplete', () => {
    expect(getMissingInstructorFields({ ...complete, specialties: [] })).toContain('specialties');
    expect(getMissingInstructorFields({ ...complete, specialties: null })).toContain('specialties');
  });

  it('empty location text → incomplete (coords do not count)', () => {
    expect(getMissingInstructorFields({ ...complete, location: '' })).toContain('location');
  });

  it('years_experience must be > 0 (0 and null are incomplete)', () => {
    expect(getMissingInstructorFields({ ...complete, years_experience: 0 })).toContain('years_experience');
    expect(getMissingInstructorFields({ ...complete, years_experience: null })).toContain('years_experience');
    expect(isInstructorProfileComplete({ ...complete, years_experience: 1 })).toBe(true);
  });

  it('reports every missing field for an empty profile, in display order', () => {
    expect(getMissingInstructorFields({})).toEqual(['photo', 'bio', 'specialties', 'location', 'years_experience']);
  });
});
