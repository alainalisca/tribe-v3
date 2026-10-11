import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockLogError = vi.fn();
vi.mock('@/lib/logger', () => ({ logError: (...a: unknown[]) => mockLogError(...a) }));

import { fetchInviterFirstName } from './referralInviterClient';

const fetchMock = vi.fn();

describe('fetchInviterFirstName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('calls the trailing-slash path with the code encoded, and returns the name', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ firstName: 'Ana' }), { status: 200 }));
    expect(await fetchInviterFirstName('TRIBE-AB2CD&x=1')).toBe('Ana');
    expect(fetchMock).toHaveBeenCalledWith('/api/referral/inviter/?code=TRIBE-AB2CD%26x%3D1');
  });

  it('returns null for an unknown code without logging', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ firstName: null }), { status: 200 }));
    expect(await fetchInviterFirstName('TRIBE-ZZZZZ')).toBeNull();
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it('returns null quietly on 400 and 429, and logs anything else', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 400 }));
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 429 }));
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 307 }));
    expect(await fetchInviterFirstName('a')).toBeNull();
    expect(await fetchInviterFirstName('b')).toBeNull();
    expect(mockLogError).not.toHaveBeenCalled();
    expect(await fetchInviterFirstName('c')).toBeNull();
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  it('never throws on a network failure', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await fetchInviterFirstName('TRIBE-AB2CD')).toBeNull();
    expect(mockLogError).toHaveBeenCalledWith(expect.objectContaining({ message: 'offline' }), {
      action: 'fetchInviterFirstName',
    });
  });
});
