import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { renderStory, storyLine, storyPhotoBox, STORY_HEIGHT, STORY_WIDTH } from './story';

/**
 * T-MOM1 Part D, spec test: the story is 1080 x 1920 and the photo is never
 * cropped. A solid red photo is rendered, and the red area found in the
 * output must have the photo's own aspect ratio and touch two opposite edges.
 */
async function redPhoto(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#ff0000' } }).webp().toBuffer();
}

async function redBox(story: Buffer) {
  const { data, info } = await sharp(story).raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  for (let y = 0; y < info.height; y += 2)
    for (let x = 0; x < info.width; x += 2) {
      const i = (y * info.width + x) * info.channels;
      if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  return { info, width: maxX - minX + 2, height: maxY - minY + 2, minX, minY };
}

describe('the story image (T-MOM1 Part D)', () => {
  it.each([
    ['horizontal 4:3', 1200, 900],
    ['vertical 4:5', 960, 1200],
    ['tall 1:3', 600, 1800],
  ])('%s: 1080 x 1920, the whole photo at its own aspect ratio', async (_name, w, h) => {
    const out = await renderStory({ photo: await redPhoto(w, h), coach: 'Salomón', gym: 'BullBox', lang: 'es' });
    const box = await redBox(out);
    expect([box.info.width, box.info.height]).toEqual([STORY_WIDTH, STORY_HEIGHT]);
    expect(Math.abs(box.width / box.height - w / h)).toBeLessThan(0.02);
    const fit = storyPhotoBox(w, h);
    expect(fit.width === STORY_WIDTH || fit.height === STORY_HEIGHT).toBe(true);
    expect(Math.abs(box.width - fit.width)).toBeLessThanOrEqual(4);
  }, 20_000);

  it('the box never leaves the canvas and is centred', () => {
    for (const [w, h] of [
      [1200, 900],
      [900, 1600],
      [1080, 1920],
      [400, 2000],
    ]) {
      const b = storyPhotoBox(w, h);
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.top).toBeGreaterThanOrEqual(0);
      expect(b.left + b.width).toBeLessThanOrEqual(STORY_WIDTH);
      expect(b.top + b.height).toBeLessThanOrEqual(STORY_HEIGHT);
      expect(Math.abs(b.left * 2 + b.width - STORY_WIDTH)).toBeLessThanOrEqual(1);
    }
  });

  it('the line: "con <coach>" plus the gym when set, in one line', () => {
    expect(storyLine('Salomón', 'BullBox', 'es')).toBe('con Salomón · BullBox');
    expect(storyLine('Salomón', null, 'es')).toBe('con Salomón');
    expect(storyLine('Salomón', ' ', 'en')).toBe('with Salomón');
    // Too long for one line: the gym goes before anything is cut.
    expect(storyLine('Salomón', 'Zona Fitness Medellín Centro', 'es')).toBe('con Salomón');
    expect(storyLine('A'.repeat(80), null, 'es').endsWith('…')).toBe(true);
  });
});
