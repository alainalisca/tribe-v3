import { describe, it, expect } from 'vitest';
import {
  isInstructorProfileComplete,
  getMissingInstructorFields,
  type InstructorProfileFields,
} from './instructorProfile';

/**
 * T-PROF1: an instructor is discoverable only with all five required fields.
 * Rules: photo (avatar_url OR photos[]), bio (instructor_bio OR bio),
 * >=1 entry in sports OR specialties, location text, years_experience > 0.
 *
 * Issue 1 (2026-09-17) widened the third rule from `specialties` alone to
 * either column. `sports` is what discovery filters on, so gating visibility
 * on the free-text column would have hidden the instructors the sport filter
 * exists to surface. These tests pin BOTH directions of the OR, because a
 * predicate that reads only one column still passes every test that supplies
 * both.
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

  it('both sports and specialties empty → incomplete', () => {
    expect(getMissingInstructorFields({ ...complete, sports: [], specialties: [] })).toContain('sports_or_specialties');
    expect(getMissingInstructorFields({ ...complete, sports: null, specialties: null })).toContain(
      'sports_or_specialties'
    );
  });

  it('sports alone is enough, with no free text at all', () => {
    // The instructor who picks their sports and writes nothing has filled in
    // the field discovery actually uses. Hiding them was the hole.
    const p = { ...complete, sports: ['Boxing'], specialties: [] };
    expect(getMissingInstructorFields(p)).toEqual([]);
    expect(isInstructorProfileComplete(p)).toBe(true);
  });

  it('specialties alone is still enough, for an offering with no canonical sport', () => {
    // Marcela Anahata's sound healing and women's circles map to no sport in
    // lib/sports.ts. She was complete before Issue 1 and must stay complete.
    const p = { ...complete, sports: [], specialties: ['Terapia de sonido'] };
    expect(getMissingInstructorFields(p)).toEqual([]);
    expect(isInstructorProfileComplete(p)).toBe(true);
  });

  it('a whitespace-only entry does not satisfy either column', () => {
    expect(getMissingInstructorFields({ ...complete, sports: ['   '], specialties: ['  '] })).toContain(
      'sports_or_specialties'
    );
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
    expect(getMissingInstructorFields({})).toEqual([
      'photo',
      'bio',
      'sports_or_specialties',
      'location',
      'years_experience',
    ]);
  });
});
