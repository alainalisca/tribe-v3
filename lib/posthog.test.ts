/**
 * T-ANALYTICS1 part A: lib/posthog.ts init options and the pre-load queue.
 *
 * The queue is the fix for a failure that never showed up anywhere: before it,
 * every helper read getPostHog(), got null while the SDK chunk was still
 * loading, and returned. Nothing errored, so the only symptom was a hole in the
 * data where the landing pageview, the first identify() and the first event on
 * a share link should have been. These tests pin that a call made in that window
 * arrives, in order, and that a failed load does not leave a queue that grows
 * forever.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const init = vi.fn();
const capture = vi.fn();
const fakePostHog = { init, capture };

vi.mock('posthog-js', () => ({ default: fakePostHog }));

import { __resetPostHogForTests, getPostHog, initPostHog, withPostHog } from './posthog';

beforeEach(() => {
  __resetPostHogForTests();
  init.mockReset();
  capture.mockReset();
});

describe('initPostHog options', () => {
  it('lets the SDK capture pageviews on history change, which is what turns $pageleave on', async () => {
    await initPostHog();
    expect(init).toHaveBeenCalledOnce();
    const options = init.mock.calls[0][1];
    expect(options.capture_pageview).toBe('history_change');
    // 'if_capture_pageview' is only meaningful because capture_pageview is
    // truthy. The two assertions together are the $pageleave fix.
    expect(options.capture_pageleave).toBe('if_capture_pageview');
  });

  it('keeps person profiles to identified users only', async () => {
    await initPostHog();
    expect(init.mock.calls[0][1].person_profiles).toBe('identified_only');
  });

  it('does not opt into a defaults date, which would also change session replay', async () => {
    await initPostHog();
    expect(init.mock.calls[0][1]).not.toHaveProperty('defaults');
  });

  it('initializes once however many times it is asked', async () => {
    await Promise.all([initPostHog(), initPostHog(), initPostHog()]);
    expect(init).toHaveBeenCalledOnce();
  });
});

describe('withPostHog before the SDK has loaded', () => {
  it('queues calls and replays them in order once it loads', async () => {
    expect(getPostHog()).toBeNull();
    withPostHog((ph) => ph.capture('first'));
    withPostHog((ph) => ph.capture('second'));
    // Nothing yet: the instance does not exist.
    expect(capture).not.toHaveBeenCalled();

    await initPostHog();

    expect(capture.mock.calls.map((c) => c[0])).toEqual(['first', 'second']);
  });

  it('starts the load itself, so a call is not stranded waiting for someone else to', async () => {
    withPostHog((ph) => ph.capture('lonely'));
    // No explicit initPostHog() from the test: withPostHog must have started it.
    await vi.waitFor(() => expect(capture).toHaveBeenCalledWith('lonely'));
    expect(init).toHaveBeenCalledOnce();
  });

  it('runs a call immediately once the SDK is loaded', async () => {
    await initPostHog();
    withPostHog((ph) => ph.capture('now'));
    expect(capture).toHaveBeenCalledWith('now');
  });

  it('a call that throws does not stop the ones queued after it', async () => {
    withPostHog(() => {
      throw new Error('boom');
    });
    withPostHog((ph) => ph.capture('survivor'));
    await initPostHog();
    expect(capture).toHaveBeenCalledWith('survivor');
  });

  it('caps the queue so a page where the SDK never loads cannot grow it forever', async () => {
    for (let i = 0; i < 1000; i++) withPostHog((ph) => ph.capture(`e${i}`));
    await initPostHog();
    expect(capture).toHaveBeenCalledTimes(200);
    // The cap keeps the OLDEST calls: the landing pageview and first identify
    // are the ones this queue exists for.
    expect(capture.mock.calls[0][0]).toBe('e0');
  });
});

describe('a failed load', () => {
  it('drops what was queued and lets a later call try again', async () => {
    init.mockImplementationOnce(() => {
      throw new Error('chunk failed');
    });
    withPostHog((ph) => ph.capture('lost'));
    expect(await initPostHog()).toBeNull();
    expect(getPostHog()).toBeNull();

    // Second attempt succeeds; the call from the failed attempt is gone, not
    // replayed against a different page state.
    withPostHog((ph) => ph.capture('after-retry'));
    await initPostHog();
    expect(capture.mock.calls.map((c) => c[0])).toEqual(['after-retry']);
  });
});
