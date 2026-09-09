import { describe, it, expect } from 'vitest';
import { buildCardPhotos } from './sessionPhotos';

const S = (n: number) => `https://cdn/session-${n}.jpg`;
const R = (n: number) => `https://cdn/recap-${n}.jpg`;
const BANNER = 'https://cdn/banner.jpg';

describe('buildCardPhotos', () => {
  it('puts session photos first, then recap photos', () => {
    expect(buildCardPhotos({ sessionPhotos: [S(1), S(2)], recapPhotos: [R(1)] })).toEqual([
      { src: S(1), kind: 'session' },
      { src: S(2), kind: 'session' },
      { src: R(1), kind: 'recap' },
    ]);
  });

  it('keeps the session photos in their stored order', () => {
    const stored = [S(3), S(1), S(2)];
    expect(buildCardPhotos({ sessionPhotos: stored }).map((p) => p.src)).toEqual(stored);
  });

  it('de-duplicates by URL, keeping the earlier kind', () => {
    const shared = S(1);
    const result = buildCardPhotos({ sessionPhotos: [shared], recapPhotos: [shared, R(1)] });
    expect(result).toEqual([
      { src: shared, kind: 'session' },
      { src: R(1), kind: 'recap' },
    ]);
  });

  it('caps at six slides by default', () => {
    const result = buildCardPhotos({
      sessionPhotos: [S(1), S(2), S(3), S(4)],
      recapPhotos: [R(1), R(2), R(3), R(4)],
    });
    expect(result).toHaveLength(6);
    expect(result.map((p) => p.src)).toEqual([S(1), S(2), S(3), S(4), R(1), R(2)]);
  });

  it('honours an explicit cap', () => {
    expect(buildCardPhotos({ sessionPhotos: [S(1), S(2), S(3)], max: 2 })).toHaveLength(2);
  });

  it('returns nothing when there is nothing, so the card keeps its sport fallback', () => {
    expect(buildCardPhotos({})).toEqual([]);
    expect(buildCardPhotos({ sessionPhotos: [], recapPhotos: [], bannerUrl: null })).toEqual([]);
  });

  it('drops empty strings rather than rendering a broken slide', () => {
    expect(buildCardPhotos({ sessionPhotos: ['', S(1)], recapPhotos: [''] })).toEqual([{ src: S(1), kind: 'session' }]);
  });

  describe('the banner', () => {
    it('is the only slide when the session has no photos of its own', () => {
      expect(buildCardPhotos({ bannerUrl: BANNER })).toEqual([{ src: BANNER, kind: 'banner' }]);
    });

    it('is never appended after real photos', () => {
      // It is a profile header, not a photo of this session. Appending it would
      // put the same image at the end of every card by that instructor and turn
      // single-photo cards into two-slide carousels.
      expect(buildCardPhotos({ sessionPhotos: [S(1)], bannerUrl: BANNER })).toEqual([{ src: S(1), kind: 'session' }]);
      expect(buildCardPhotos({ recapPhotos: [R(1)], bannerUrl: BANNER })).toEqual([{ src: R(1), kind: 'recap' }]);
    });

    it('leaves a single-photo card as a single hero with no carousel chrome', () => {
      expect(buildCardPhotos({ sessionPhotos: [S(1)], recapPhotos: [], bannerUrl: BANNER })).toHaveLength(1);
    });
  });
});
