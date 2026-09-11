/**
 * The gym chip and the carousel's photo counter share the hero's top-left
 * corner (T-GYM1).
 *
 * This exists because the first version gated the chip on `!useCarousel`, which
 * made the feature close to dead on real content: every BullBox session in
 * production carries three photos, so the carousel was always on and the chip
 * never rendered. Al saw the bolded venue and no chip and correctly asked
 * whether that was the whole treatment. It was not.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SessionCardHero from './SessionCardHero';
import type { CardPhoto } from '@/lib/sessionPhotos';

vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));

const THREE_PHOTOS: CardPhoto[] = [
  { src: 'https://cdn/a.jpg', kind: 'session' },
  { src: 'https://cdn/b.jpg', kind: 'session' },
  { src: 'https://cdn/c.jpg', kind: 'session' },
];

const CHIP = <span data-testid="gym-chip">CrossFit BullBox</span>;

function renderHero(overrides: Record<string, unknown> = {}) {
  return render(
    <SessionCardHero
      sport="CrossFit"
      sportName="CrossFit"
      heroImage="https://cdn/hero.jpg"
      imageAlt="CrossFit session"
      urgencyType={null}
      topLeftSlot={CHIP}
      {...overrides}
    />
  );
}

/** The chip's positioned wrapper, whichever offset it ended up with. */
function chipWrapper(container: HTMLElement) {
  return container.querySelector('[data-testid="gym-chip"]')?.parentElement ?? null;
}

describe('hero top-left slot', () => {
  it('renders BOTH the photo counter and the chip on a multi-photo session', () => {
    // The regression this file exists for. Every live BullBox session by a
    // coach has three photos.
    const { container } = renderHero({ photos: THREE_PHOTOS });

    expect(screen.getByTestId('gym-chip')).toBeTruthy();
    expect(container.querySelector('.carousel-track')).toBeTruthy();
  });

  it('shifts the chip clear of the counter when the carousel is on', () => {
    // Same offset the LIVE pill uses, so the two never overlap.
    const { container } = renderHero({ photos: THREE_PHOTOS });
    expect(chipWrapper(container)?.className).toContain('left-[4.25rem]');
  });

  it('keeps the chip at the corner when there is only one photo', () => {
    const { container } = renderHero({ photos: [THREE_PHOTOS[0]] });
    expect(screen.getByTestId('gym-chip')).toBeTruthy();
    expect(chipWrapper(container)?.className).toContain('left-3');
    expect(chipWrapper(container)?.className).not.toContain('left-[4.25rem]');
  });

  it('suppresses the chip entirely while the session is LIVE', () => {
    // Three things in one corner is one too many; LIVE wins outright and the
    // venue is still named on the address line.
    renderHero({ photos: THREE_PHOTOS, liveCount: 4, liveLabel: 'LIVE' });
    expect(screen.queryByTestId('gym-chip')).toBeNull();
  });

  it('renders nothing extra when no slot is supplied', () => {
    renderHero({ photos: THREE_PHOTOS, topLeftSlot: undefined });
    expect(screen.queryByTestId('gym-chip')).toBeNull();
  });
});
