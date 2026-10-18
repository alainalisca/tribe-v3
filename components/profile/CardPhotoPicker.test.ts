import { describe, it, expect } from 'vitest';
import { CARD_RATIO, boxSize, startBox } from './CardPhotoPicker';

/** T-SHARE1 Part C: the picker's box is the largest card-shaped area, and dragging only moves it. */
describe('the picker box', () => {
  it('is card-shaped in pixels whatever the photo', () => {
    for (const [w, h] of [
      [1200, 1919],
      [6000, 3368],
      [1080, 1080],
    ]) {
      const { bw, bh } = boxSize(w, h);
      expect(Math.abs((bw * w) / (bh * h) - CARD_RATIO)).toBeLessThan(1e-9);
      expect(Math.max(bw, bh)).toBe(1);
    }
  });

  it('starts where the card would crop with no pick, or on the saved box, kept inside the photo', () => {
    const { bw, bh } = boxSize(1200, 1919);
    expect(startBox(bw, bh, null)).toEqual({ x0: 0, y0: Math.max(0, 1 / 3 - bh / 2) });
    expect(startBox(bw, bh, { x0: 0, y0: 0.99, x1: 1, y1: 1 }).y0).toBeCloseTo(1 - bh);
  });
});
