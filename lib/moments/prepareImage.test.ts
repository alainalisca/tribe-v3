import { describe, it, expect } from 'vitest';
import { fitScale, isHeic } from './prepareImage';
import { exifCaptureDate } from './exifDate';

describe('browser image prep (T-MOM1)', () => {
  it('spots HEIC by type or name', () => {
    expect(isHeic({ type: 'image/heic', name: 'a' })).toBe(true);
    expect(isHeic({ type: '', name: 'IMG_1.HEIC' })).toBe(true);
    expect(isHeic({ type: 'image/jpeg', name: 'a.jpg' })).toBe(false);
  });
  it('scales the long side to 2400 and never enlarges', () => {
    expect(fitScale(4800, 3200)).toBe(0.5);
    expect(fitScale(1000, 3000)).toBeCloseTo(0.8);
    expect(fitScale(800, 600)).toBe(1);
  });
  it('reads the capture time as the earliest EXIF stamp', () => {
    expect(exifCaptureDate('xx2026:10:20 09:00:00yy2026:10:18 18:31:05')?.getDate()).toBe(18);
    expect(exifCaptureDate('no dates here')).toBeNull();
  });
});
