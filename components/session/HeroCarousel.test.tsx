import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import HeroCarousel from './HeroCarousel';
import type { CardPhoto } from '@/lib/sessionPhotos';

vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));

const photos: CardPhoto[] = [
  { src: 'https://cdn/a.jpg', kind: 'session' },
  { src: 'https://cdn/b.jpg', kind: 'session' },
  { src: 'https://cdn/c.jpg', kind: 'recap' },
];

/** jsdom gives every element a clientWidth of 0; the index maths needs a real one. */
function sizeTrack(track: HTMLElement, width = 300) {
  Object.defineProperty(track, 'clientWidth', { value: width, configurable: true });
  return {
    scrollTo: (x: number) => {
      Object.defineProperty(track, 'scrollLeft', { value: x, configurable: true });
      fireEvent.scroll(track);
    },
  };
}

function getTrack(container: HTMLElement) {
  return container.querySelector('.carousel-track') as HTMLElement;
}

beforeEach(() => {
  vi.restoreAllMocks();
  // rAF in the index hook: run it synchronously so assertions are not racy.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

describe('<HeroCarousel /> tap vs swipe', () => {
  it('treats a press that barely moved as a tap and opens the session', () => {
    const onTap = vi.fn();
    const { container } = render(<HeroCarousel photos={photos} alt="a" onTap={onTap} />);
    const track = getTrack(container);

    fireEvent.pointerDown(track, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(track, { clientX: 103, clientY: 102 });
    fireEvent.pointerUp(track);

    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('treats a press that moved past the slop as a swipe and does not navigate', () => {
    const onTap = vi.fn();
    const { container } = render(<HeroCarousel photos={photos} alt="a" onTap={onTap} />);
    const track = getTrack(container);

    fireEvent.pointerDown(track, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(track, { clientX: 140, clientY: 100 });
    fireEvent.pointerUp(track);

    expect(onTap).not.toHaveBeenCalled();
  });

  it('does not fire a tap when the gesture is cancelled', () => {
    const onTap = vi.fn();
    const { container } = render(<HeroCarousel photos={photos} alt="a" onTap={onTap} />);
    const track = getTrack(container);

    fireEvent.pointerDown(track, { clientX: 100, clientY: 100 });
    fireEvent.pointerCancel(track);
    fireEvent.pointerUp(track);

    expect(onTap).not.toHaveBeenCalled();
  });
});

describe('<HeroCarousel /> index reporting', () => {
  it('reports the slide the track has scrolled to', () => {
    const onIndexChange = vi.fn();
    const { container } = render(<HeroCarousel photos={photos} alt="a" onIndexChange={onIndexChange} />);
    const track = sizeTrack(getTrack(container));

    track.scrollTo(300);
    expect(onIndexChange).toHaveBeenLastCalledWith(1, 'swipe');

    track.scrollTo(600);
    expect(onIndexChange).toHaveBeenLastCalledWith(2, 'swipe');
  });

  it('rounds to the nearest slide mid-gesture rather than jumping about', () => {
    const onIndexChange = vi.fn();
    const { container } = render(<HeroCarousel photos={photos} alt="a" onIndexChange={onIndexChange} />);
    const track = sizeTrack(getTrack(container));

    track.scrollTo(140); // still mostly slide 0
    expect(onIndexChange).not.toHaveBeenCalled();

    track.scrollTo(160); // past halfway
    expect(onIndexChange).toHaveBeenLastCalledWith(1, 'swipe');
  });

  it('never reports an index outside the slide range', () => {
    const onIndexChange = vi.fn();
    const { container } = render(<HeroCarousel photos={photos} alt="a" onIndexChange={onIndexChange} />);
    const track = sizeTrack(getTrack(container));

    track.scrollTo(99999);
    expect(onIndexChange).toHaveBeenLastCalledWith(photos.length - 1, 'swipe');
  });
});

describe('<HeroCarousel /> chrome', () => {
  it('shows a counter and one dot per photo when there are several', () => {
    const { container } = render(<HeroCarousel photos={photos} alt="a" />);
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    expect(container.querySelectorAll('[class*="rounded-full"][class*="bg-white"]').length).toBeGreaterThan(0);
  });

  it('labels each slide for a screen reader', () => {
    render(<HeroCarousel photos={photos} alt="a" />);
    expect(screen.getByLabelText('Photo 2 of 3')).toBeInTheDocument();
  });

  it('offers previous and next controls', () => {
    render(<HeroCarousel photos={photos} alt="a" />);
    expect(screen.getByLabelText('Previous photo')).toBeInTheDocument();
    expect(screen.getByLabelText('Next photo')).toBeInTheDocument();
  });

  it('shows no counter, dots or chevrons for a single photo', () => {
    render(<HeroCarousel photos={[photos[0]]} alt="a" />);
    expect(screen.queryByText('1 / 1')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Next photo')).not.toBeInTheDocument();
  });
});

describe('<HeroCarousel /> lazy slides', () => {
  it('mounts only the first slide before the card is in view or scrolled', () => {
    // useInView falls back to "visible" when IntersectionObserver is missing,
    // so stub a real one that never reports an intersection.
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
    const { container } = render(<HeroCarousel photos={photos} alt="a" />);
    // Six photos per card across a feed page is the thing to avoid.
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });
});

describe('<HeroCarousel /> mouse drag', () => {
  /** jsdom has no layout and no pointer capture; supply both. */
  function dragSetup(container: HTMLElement, width = 300) {
    const track = container.querySelector('.carousel-track') as HTMLElement;
    Object.defineProperty(track, 'clientWidth', { value: width, configurable: true });
    let scrollLeft = 0;
    Object.defineProperty(track, 'scrollLeft', {
      get: () => scrollLeft,
      set: (v: number) => {
        scrollLeft = v;
      },
      configurable: true,
    });
    track.setPointerCapture = vi.fn();
    track.releasePointerCapture = vi.fn();
    const scrollTo = vi.fn();
    track.scrollTo = scrollTo as unknown as typeof track.scrollTo;
    return { track, scrollTo, getScrollLeft: () => scrollLeft };
  }

  it('scrolls the track when a mouse drags past the threshold', () => {
    const { container } = render(<HeroCarousel photos={photos} alt="a" />);
    const { track, getScrollLeft } = dragSetup(container);

    fireEvent.pointerDown(track, { pointerType: 'mouse', pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(track, { pointerType: 'mouse', pointerId: 1, clientX: 120, clientY: 100 });

    // Dragging left by 80px scrolls the track right by 80px.
    expect(getScrollLeft()).toBe(80);
  });

  it('does not move the track until the drag passes the tap threshold', () => {
    const { container } = render(<HeroCarousel photos={photos} alt="a" />);
    const { track, getScrollLeft } = dragSetup(container);

    fireEvent.pointerDown(track, { pointerType: 'mouse', pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(track, { pointerType: 'mouse', pointerId: 1, clientX: 195, clientY: 100 });

    // 5px is still a click, not a drag.
    expect(getScrollLeft()).toBe(0);
  });

  it('still opens the session when a mouse click barely moves', () => {
    const onTap = vi.fn();
    const { container } = render(<HeroCarousel photos={photos} alt="a" onTap={onTap} />);
    const { track } = dragSetup(container);

    fireEvent.pointerDown(track, { pointerType: 'mouse', pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(track, { pointerType: 'mouse', pointerId: 1, clientX: 203, clientY: 101 });
    fireEvent.pointerUp(track, { pointerType: 'mouse', pointerId: 1 });

    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('does not open the session after a real drag', () => {
    const onTap = vi.fn();
    const { container } = render(<HeroCarousel photos={photos} alt="a" onTap={onTap} />);
    const { track } = dragSetup(container);

    fireEvent.pointerDown(track, { pointerType: 'mouse', pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(track, { pointerType: 'mouse', pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerUp(track, { pointerType: 'mouse', pointerId: 1 });

    expect(onTap).not.toHaveBeenCalled();
  });

  it('snaps to the nearest photo on release', () => {
    const { container } = render(<HeroCarousel photos={photos} alt="a" />);
    const { track, scrollTo } = dragSetup(container);

    fireEvent.pointerDown(track, { pointerType: 'mouse', pointerId: 1, clientX: 400, clientY: 100 });
    // Past halfway into slide 1 (scrollLeft 170 of a 300px slide).
    fireEvent.pointerMove(track, { pointerType: 'mouse', pointerId: 1, clientX: 230, clientY: 100 });
    fireEvent.pointerUp(track, { pointerType: 'mouse', pointerId: 1 });

    expect(scrollTo).toHaveBeenCalledWith({ left: 300, behavior: 'smooth' });
  });

  it('snaps back when the drag did not clear half a slide', () => {
    const { container } = render(<HeroCarousel photos={photos} alt="a" />);
    const { track, scrollTo } = dragSetup(container);

    fireEvent.pointerDown(track, { pointerType: 'mouse', pointerId: 1, clientX: 400, clientY: 100 });
    fireEvent.pointerMove(track, { pointerType: 'mouse', pointerId: 1, clientX: 330, clientY: 100 });
    fireEvent.pointerUp(track, { pointerType: 'mouse', pointerId: 1 });

    expect(scrollTo).toHaveBeenCalledWith({ left: 0, behavior: 'smooth' });
  });

  it('leaves touch alone so native momentum scrolling is untouched', () => {
    const { container } = render(<HeroCarousel photos={photos} alt="a" />);
    const { track, getScrollLeft } = dragSetup(container);

    fireEvent.pointerDown(track, { pointerType: 'touch', pointerId: 2, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(track, { pointerType: 'touch', pointerId: 2, clientX: 100, clientY: 100 });

    // The browser scrolls a touch gesture itself; taking it over would break
    // momentum and snap, which already work on a phone.
    expect(getScrollLeft()).toBe(0);
  });

  it('does not drag a single-photo hero', () => {
    const { container } = render(<HeroCarousel photos={[photos[0]]} alt="a" />);
    const { track, getScrollLeft } = dragSetup(container);

    fireEvent.pointerDown(track, { pointerType: 'mouse', pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(track, { pointerType: 'mouse', pointerId: 1, clientX: 100, clientY: 100 });

    expect(getScrollLeft()).toBe(0);
  });

  it('marks the track while dragging so snap and smooth-scroll stand down', () => {
    const { container } = render(<HeroCarousel photos={photos} alt="a" />);
    const { track } = dragSetup(container);

    expect(track.className).not.toContain('is-dragging');
    fireEvent.pointerDown(track, { pointerType: 'mouse', pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(track, { pointerType: 'mouse', pointerId: 1, clientX: 100, clientY: 100 });
    expect(track.className).toContain('is-dragging');

    fireEvent.pointerUp(track, { pointerType: 'mouse', pointerId: 1 });
    expect(track.className).not.toContain('is-dragging');
  });

  it('gives up the drag cleanly when the gesture is cancelled', () => {
    const onTap = vi.fn();
    const { container } = render(<HeroCarousel photos={photos} alt="a" onTap={onTap} />);
    const { track } = dragSetup(container);

    fireEvent.pointerDown(track, { pointerType: 'mouse', pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(track, { pointerType: 'mouse', pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerCancel(track, { pointerType: 'mouse', pointerId: 1 });

    expect(track.className).not.toContain('is-dragging');
    fireEvent.pointerUp(track, { pointerType: 'mouse', pointerId: 1 });
    expect(onTap).not.toHaveBeenCalled();
  });
});
