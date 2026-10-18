import { describe, it, expect } from 'vitest';
import { CARD_PHOTO_RATIO, cardPixelBox, isCardBox } from './cardCrop';

/** T-SHARE1 Part C: a coach's photo cut to the card's 696 x 630, never stretched. */
const ratio = (b: { width: number; height: number }) => b.width / b.height;

describe('cardPixelBox', () => {
  it('with no box: the largest card-shaped crop, centred across, its middle on the upper third', () => {
    const portrait = cardPixelBox(1200, 1919);
    expect(portrait.width).toBe(1200);
    expect(Math.abs(ratio(portrait) - CARD_PHOTO_RATIO)).toBeLessThan(0.002);
    expect(portrait.top).toBe(Math.round(1919 / 3 - portrait.height / 2));
    const landscape = cardPixelBox(6000, 3368);
    expect(landscape.height).toBe(3368);
    expect(landscape.left).toBe(Math.round((6000 - landscape.width) / 2));
  });

  it('grows a box around its centre to the card ratio, inside the photo', () => {
    // Salomón: 74% wide by the full height of a landscape frame; too wide, so it grows taller, capped by the frame.
    const b = cardPixelBox(5653, 3782, { x0: 0.13, y0: 0, x1: 0.87, y1: 1 });
    expect(b.top).toBe(0);
    expect(b.height).toBe(3782);
    expect(Math.abs(ratio(b) - CARD_PHOTO_RATIO)).toBeLessThan(0.002);
    expect(b.left + b.width).toBeLessThanOrEqual(5653);
    // A small box in a corner never leaves the frame.
    const c = cardPixelBox(1000, 1000, { x0: 0.9, y0: 0.9, x1: 1, y1: 1 });
    expect(c.left + c.width).toBeLessThanOrEqual(1000);
    expect(c.top + c.height).toBeLessThanOrEqual(1000);
  });

  it('accepts only a box inside the photo and not empty, like users_card_photo_box_shape (220)', () => {
    expect(isCardBox({ x0: 0, y0: 0.1, x1: 1, y1: 0.7 })).toBe(true);
    expect(isCardBox({ x0: 0.5, y0: 0, x1: 0.4, y1: 1 })).toBe(false);
    expect(isCardBox({ x0: -0.1, y0: 0, x1: 1, y1: 1 })).toBe(false);
    expect(isCardBox({ x0: 0, y0: 0, x1: 1 })).toBe(false);
    expect(isCardBox('0,0,1,1')).toBe(false);
    expect(isCardBox(null)).toBe(false);
  });
});
