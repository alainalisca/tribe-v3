import { describe, it, expect } from 'vitest';
import { getSessionHeroImage, getSportGradient } from './sport-images';

describe('getSessionHeroImage', () => {
  it('prefers the session photo above everything else', () => {
    expect(getSessionHeroImage('Yoga', ['https://cdn/a.jpg'], 'https://cdn/banner.jpg')).toBe('https://cdn/a.jpg');
  });

  it('falls back to the instructor banner when there is no session photo', () => {
    expect(getSessionHeroImage('Yoga', [], 'https://cdn/banner.jpg')).toBe('https://cdn/banner.jpg');
    expect(getSessionHeroImage('Yoga', null, 'https://cdn/banner.jpg')).toBe('https://cdn/banner.jpg');
  });

  it('falls back to the sport photo, matching case-insensitively', () => {
    expect(getSessionHeroImage('Yoga', [], null)).toBe('/images/sports/yoga.jpg');
    expect(getSessionHeroImage('CrossFit', null, null)).toBe('/images/sports/crossfit.jpg');
    expect(getSessionHeroImage('HYROX', null, null)).toBe('/images/sports/hyrox.jpg');
  });

  it('maps the Other category to the generic default photo', () => {
    expect(getSessionHeroImage('Other', null, null)).toBe('/images/sports/default.jpg');
  });

  it('returns empty for a sport with no shipped photo so the card keeps its gradient', () => {
    // Shipping a path for these would 404 on every card and flash to the
    // gradient through onError, which is worse than starting there.
    for (const sport of ['Muay Thai', 'Kickboxing', 'Jiu-Jitsu', 'Volleyball', 'Padel', 'Skateboarding', 'BMX']) {
      expect(getSessionHeroImage(sport, null, null)).toBe('');
    }
  });

  it('returns empty for a sport nobody has heard of', () => {
    expect(getSessionHeroImage('Quidditch', null, null)).toBe('');
  });
});

describe('getSportGradient', () => {
  it('gives the photographed sports their own gradient', () => {
    expect(getSportGradient('CrossFit')).toBe('from-red-600 to-orange-800');
    expect(getSportGradient('Yoga')).toBe('from-purple-600 to-indigo-800');
    // Lookup lowercases, so the stored capitalised value has to work.
    expect(getSportGradient('running')).toBe(getSportGradient('Running'));
  });

  it('documents that the unphotographed sports share the generic brand gradient', () => {
    // Not an endorsement, a record of current behaviour. The gradient map still
    // carries keys from an older sport list (martial_arts, strength, functional)
    // and has no entry for these seven, so "stays on its gradient" really means
    // "stays on the generic green one". Giving them distinct gradients is a
    // follow-up, not this ticket.
    const generic = 'from-tribe-green to-lime-700';
    for (const sport of ['Muay Thai', 'Kickboxing', 'Jiu-Jitsu', 'Volleyball', 'Padel', 'Skateboarding', 'BMX']) {
      expect(getSportGradient(sport)).toBe(generic);
    }
  });
});
