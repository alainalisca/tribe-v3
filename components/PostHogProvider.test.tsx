/**
 * T-ANALYTICS1 part A. PostHogProvider must start the SDK load and must NOT
 * capture $pageview itself: posthog-js now does that (`capture_pageview:
 * 'history_change'`), so a manual capture here would count every route twice.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const initPostHog = vi.fn(() => Promise.resolve(null));
const capture = vi.fn();

vi.mock('@/lib/posthog', () => ({
  initPostHog: () => initPostHog(),
  getPostHog: () => ({ capture }),
  withPostHog: (call: (ph: { capture: typeof capture }) => void) => call({ capture }),
}));

import { PostHogProvider } from './PostHogProvider';

describe('PostHogProvider', () => {
  it('renders its children and starts the PostHog load once', () => {
    const { rerender } = render(
      <PostHogProvider>
        <p>child</p>
      </PostHogProvider>
    );
    rerender(
      <PostHogProvider>
        <p>child</p>
      </PostHogProvider>
    );
    expect(screen.getByText('child')).toBeInTheDocument();
    expect(initPostHog).toHaveBeenCalledOnce();
  });

  it('never captures a pageview of its own', () => {
    render(
      <PostHogProvider>
        <p>child</p>
      </PostHogProvider>
    );
    expect(capture).not.toHaveBeenCalled();
  });
});
