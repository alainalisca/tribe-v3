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
