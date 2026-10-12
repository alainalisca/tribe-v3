/**
 * T-ANALYTICS1 part D: trackEvent's types are the contract.
 *
 * The @ts-expect-error lines are the type-level tests. vitest does not
 * typecheck, so they are enforced by `tsc` over the test files: if any of
 * those calls STOPPED being an error (an unknown name accepted, a required
 * property made optional), the directive itself becomes the compile error.
 * The runtime cases check that the properties reach PostHog untouched.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const init = vi.fn();
const capture = vi.fn();
vi.mock('posthog-js', () => ({ default: { init, capture } }));

import { __resetPostHogForTests, initPostHog } from './posthog';
import { channelFor, trackEvent } from './analytics';

beforeEach(() => {
  __resetPostHogForTests();
  vi.clearAllMocks();
});

function typeLevelContract() {
  // @ts-expect-error -- not an EventName: names cannot drift
  trackEvent('session_viewd', {});
  // @ts-expect-error -- share_clicked was not adopted (decision 3)
  trackEvent('share_clicked', {});
  // @ts-expect-error -- a typed event must carry its properties
  trackEvent('session_left');
  // @ts-expect-error -- session_viewed requires source, sport, is_paid, instructor_id
  trackEvent('session_viewed', { session_id: 's1' });
  // @ts-expect-error -- channel is an enum, not free text
  trackEvent('share_link_created', { content_type: 'session', content_id: 's1', channel: 'telegram' });
  // @ts-expect-error -- pass_claimed must not carry what the person typed
  trackEvent('pass_claimed', { partner_slug: 'bullbox', src: null, code: null, email: 'a@b.co' });

  // Allowed: a typed event with its shape, and an untyped event with anything.
  trackEvent('session_left', { session_id: 's1' });
  trackEvent('app_opened', { anything: 1 });
  trackEvent('app_opened');
}
void typeLevelContract;

describe('trackEvent at runtime', () => {
  it('sends a typed event with its properties untouched', async () => {
    trackEvent('pass_claimed', { partner_slug: 'bullbox', src: 'runclub', code: 'RUNCLUB-SAT0927' });
    await initPostHog();
    expect(capture.mock.calls[0][0]).toBe('pass_claimed');
    expect(capture.mock.calls[0][1]).toMatchObject({
      partner_slug: 'bullbox',
      src: 'runclub',
      code: 'RUNCLUB-SAT0927',
    });
  });
});

describe('channelFor', () => {
  it.each([
    ['clipboard', 'copy'],
    ['copy', 'copy'],
    ['whatsapp', 'whatsapp'],
    ['instagram', 'instagram'],
    ['twitter', 'twitter'],
    ['native', 'native'],
    ['something-new', 'native'],
  ])('%s -> %s', (method, channel) => {
    expect(channelFor(method)).toBe(channel);
  });
});
