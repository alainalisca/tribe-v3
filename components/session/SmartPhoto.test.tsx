import { describe, it, expect } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import SmartPhoto from './SmartPhoto';

/**
 * The portrait rule is the whole reason this component exists, so it is
 * worth pinning: a portrait must never be cropped, and a landscape must
 * never grow a blurred backdrop it does not need.
 */
function loadWith(img: HTMLImageElement, naturalWidth: number, naturalHeight: number) {
  Object.defineProperty(img, 'naturalWidth', { value: naturalWidth, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: naturalHeight, configurable: true });
  fireEvent.load(img);
}

describe('<SmartPhoto />', () => {
  it('covers a landscape photo with a top-weighted focal point', () => {
    const { container } = render(<SmartPhoto src="/a.jpg" alt="a" />);
    const img = container.querySelector('img') as HTMLImageElement;
    loadWith(img, 1200, 675);

    expect(img.className).toContain('object-cover');
    expect(img.className).toContain('object-position:center_25%');
    // No blurred backdrop for a landscape photo.
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('shows a portrait whole over a blurred copy of itself', () => {
    const { container } = render(<SmartPhoto src="/b.jpg" alt="b" />);
    loadWith(container.querySelector('img') as HTMLImageElement, 900, 1600);

    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(2);

    const backdrop = images[0];
    const photo = images[1];

    // Same src: the backdrop costs no second download.
    expect(backdrop.getAttribute('src')).toBe('/b.jpg');
    expect(backdrop.getAttribute('aria-hidden')).toBe('true');
    expect(backdrop.getAttribute('alt')).toBe('');
    expect(backdrop.className).toContain('blur-[22px]');

    expect(photo.className).toContain('object-contain');
    expect(photo.className).not.toContain('object-cover');
  });
});
