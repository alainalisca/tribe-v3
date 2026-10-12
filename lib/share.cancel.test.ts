/**
 * T-ANALYTICS1: closing the share sheet is silent.
 *
 * Found on the preview (2026-10-10): tapping Compartir and closing the sheet
 * produced an unhandled $exception in PostHog -- DOMException "AbortError:
 * Share canceled", handled: false. A cancel must be: no exception, no error
 * log, no share event, and no surprise clipboard copy.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const trackEvent = vi.fn();
vi.mock('@/lib/analytics', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/analytics')>();
  return { channelFor: real.channelFor, trackEvent: (...a: unknown[]) => trackEvent(...a) };
});

import { isShareCancel, nativeShare, shareInstructor, shareSession } from './share';

const share = vi.fn();
const writeText = vi.fn().mockResolvedValue(undefined);

function abort() {
  return new DOMException('Share canceled', 'AbortError');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { share, clipboard: { writeText } });
});

afterEach(() => vi.unstubAllGlobals());

describe('isShareCancel', () => {
  it('recognises the AbortError a dismissed sheet rejects with', () => {
    expect(isShareCancel(abort())).toBe(true);
    // A WebView whose DOMException is not an Error subclass: matched by name.
    expect(isShareCancel({ name: 'AbortError', message: 'Share canceled' })).toBe(true);
  });

  it('does not swallow real failures', () => {
    expect(isShareCancel(new DOMException('No user gesture', 'NotAllowedError'))).toBe(false);
    expect(isShareCancel(new Error('boom'))).toBe(false);
    expect(isShareCancel(null)).toBe(false);
  });
});

describe('nativeShare', () => {
  it('reports a cancel without throwing', async () => {
    share.mockRejectedValue(abort());
    await expect(nativeShare({ url: 'https://tribelatam.com/s/1' })).resolves.toBe('cancelled');
  });

  it('reports a real failure as failed, so the caller can fall back', async () => {
    share.mockRejectedValue(new DOMException('No user gesture', 'NotAllowedError'));
    await expect(nativeShare({ url: 'x' })).resolves.toBe('failed');
  });

  it('reports success', async () => {
    share.mockResolvedValue(undefined);
    await expect(nativeShare({ url: 'x' })).resolves.toBe('shared');
  });

  it('reports a browser with no share sheet as unavailable', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(nativeShare({ url: 'x' })).resolves.toBe('unavailable');
  });
});

const sessionData = { id: 's1', title: 'OCR', sport: 'Other', date: '2026-10-12', time: '08:00' };

describe('shareSession / shareInstructor on cancel', () => {
  it('a cancelled session share tracks nothing and copies nothing', async () => {
    share.mockRejectedValue(abort());
    await expect(shareSession(sessionData, 'es')).resolves.toBe('cancelled');
    expect(trackEvent).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('a cancelled instructor share tracks nothing and copies nothing', async () => {
    share.mockRejectedValue(abort());
    await expect(shareInstructor({ id: 'u1', name: 'Ana' } as never, 'es')).resolves.toBe('cancelled');
    expect(trackEvent).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('a completed share is still tracked, once per event', async () => {
    share.mockResolvedValue(undefined);
    await expect(shareSession(sessionData, 'es')).resolves.toBe('native');
    expect(trackEvent.mock.calls.map((c) => c[0])).toEqual(['share_link_created', 'session_shared']);
    expect(trackEvent.mock.calls[1][1]).toMatchObject({ channel: 'native', content_type: 'session' });
  });

  it('a share sheet that FAILS (not cancelled) still falls back to copying the link', async () => {
    share.mockRejectedValue(new DOMException('No user gesture', 'NotAllowedError'));
    await expect(shareSession(sessionData, 'es')).resolves.toBe('clipboard');
    expect(writeText).toHaveBeenCalled();
    expect(trackEvent.mock.calls[1][1]).toMatchObject({ channel: 'copy' });
  });
});
