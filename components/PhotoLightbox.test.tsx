import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PhotoLightbox from './PhotoLightbox';

vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));

describe('<PhotoLightbox />', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
    document.body.style.position = '';
  });

  it('portals to document.body so a transformed card cannot clip it', () => {
    render(<PhotoLightbox photos={['/a.jpg']} initialIndex={0} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Photo viewer');
  });

  it('focuses the close button on open and restores focus on unmount', () => {
    // Regression guard: the focus effect used to run before the portal
    // mounted, so the ref was empty and focus silently stayed on <body>.
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(<PhotoLightbox photos={['/a.jpg']} initialIndex={0} onClose={() => {}} />);
    expect(document.activeElement).toBe(screen.getByLabelText('Close'));

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<PhotoLightbox photos={['/a.jpg']} initialIndex={0} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('locks body scroll and restores it', () => {
    const { unmount } = render(<PhotoLightbox photos={['/a.jpg']} initialIndex={0} onClose={() => {}} />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('yields the scroll lock when someone else already owns it', () => {
    // The session detail page locks the body itself (position:fixed plus a top
    // offset) and restores scroll on close. Taking a second lock and releasing
    // it here would race that restore and jump the page.
    document.body.style.position = 'fixed';
    document.body.style.overflow = 'hidden';

    const { unmount } = render(<PhotoLightbox photos={['/a.jpg']} initialIndex={0} onClose={() => {}} />);
    unmount();

    // Untouched: still the detail page's to unwind.
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('swipes between photos and keeps the counter in range', () => {
    render(<PhotoLightbox photos={['/a.jpg', '/b.jpg']} initialIndex={0} onClose={() => {}} />);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();

    const surface = screen.getByRole('dialog').querySelector('.touch-none') as HTMLElement;
    fireEvent.touchStart(surface, { targetTouches: [{ clientX: 300 }] });
    fireEvent.touchMove(surface, { targetTouches: [{ clientX: 100 }] });
    fireEvent.touchEnd(surface);
    expect(screen.getByText('2 / 2')).toBeInTheDocument();

    // Swiping past the end must not run off the array.
    fireEvent.touchStart(surface, { targetTouches: [{ clientX: 300 }] });
    fireEvent.touchMove(surface, { targetTouches: [{ clientX: 100 }] });
    fireEvent.touchEnd(surface);
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });
});
