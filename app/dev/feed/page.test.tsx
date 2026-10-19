import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/lib/supabase/admin', () => ({ getServiceRoleClient: vi.fn(() => ({})) }));
vi.mock('@/lib/dal/sessions', () => ({
  fetchUpcomingSessions: vi.fn(async () => ({ success: true, data: [] })),
  fetchRecapPhotosByCreators: vi.fn(async () => ({ success: true, data: {} })),
}));
vi.mock('@/lib/feed/hostHeroes', () => ({ hostHeroesFor: vi.fn(async () => ({})) }));
vi.mock('./DevFeedView', () => ({ default: () => null }));

import DevFeedPage from './page';
import { devFeedAllowed } from './devFeedAllowed';
import { fetchUpcomingSessions } from '@/lib/dal/sessions';

/** T-UI-FD1: /dev/feed is local development only, never in production or on a Vercel deployment. */
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const params = { searchParams: Promise.resolve({}) };

describe('/dev/feed', () => {
  it('opens only in local development', () => {
    expect(devFeedAllowed({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(true);
    expect(devFeedAllowed({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false);
    expect(devFeedAllowed({ NODE_ENV: 'development', VERCEL_ENV: 'preview' } as NodeJS.ProcessEnv)).toBe(false);
    expect(devFeedAllowed({ NODE_ENV: 'production', VERCEL_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false);
  });

  it('is a 404 in production, and reads nothing', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(DevFeedPage(params)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(fetchUpcomingSessions).not.toHaveBeenCalled();
  });

  it('is a 404 on a Vercel preview, and reads nothing', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'preview');
    await expect(DevFeedPage(params)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(fetchUpcomingSessions).not.toHaveBeenCalled();
  });

  it('renders locally with the feed query', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', '');
    await DevFeedPage(params);
    expect(fetchUpcomingSessions).toHaveBeenCalledTimes(1);
  });
});
