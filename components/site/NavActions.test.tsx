import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

/** T-POLISH1 PR 3b-2 (Al): no "Descarga la app" on the coach page for a signed-in viewer. */
const auth = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: auth.userId ? { user: { id: auth.userId } } : null } }),
    },
  }),
}));
vi.mock('@/lib/dal/users', () => ({
  fetchUsersByIds: async () => ({ success: true, data: [{ name: 'Ana Prueba', avatar_url: null }] }),
}));
vi.mock('./StoreButton', () => ({
  default: ({ children }: { children: React.ReactNode }) => <a href="/download/">{children}</a>,
}));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import NavActions from './NavActions';

const labels = { signIn: 'Entrar', download: 'Descarga la app', myFeed: 'Mi feed' };
const clearCookies = () =>
  document.cookie.split(';').forEach((c) => {
    document.cookie = `${c.split('=')[0].trim()}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  });

beforeEach(() => {
  clearCookies();
  auth.userId = null;
});

describe('NavActions and "Descarga la app"', () => {
  it('signed in on the coach page: the avatar, and no download link', async () => {
    document.cookie = 'sb-ref-auth-token=x; path=/';
    auth.userId = 'viewer-1';
    render(<NavActions {...labels} hideDownloadWhenSignedIn />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Mi feed' })).toBeInTheDocument());
    expect(screen.queryByText('Descarga la app')).toBeNull();
    expect(screen.queryByText('Entrar')).toBeNull();
  });

  it('signed out on the coach page: unchanged, Entrar and the download link', async () => {
    render(<NavActions {...labels} hideDownloadWhenSignedIn />);
    expect(screen.getByText('Entrar')).toBeInTheDocument();
    expect(screen.getByText('Descarga la app')).toBeInTheDocument();
  });

  it('signed in anywhere else on the site: the download link stays (the flag is off by default)', async () => {
    document.cookie = 'sb-ref-auth-token=x; path=/';
    auth.userId = 'viewer-1';
    render(<NavActions {...labels} />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Mi feed' })).toBeInTheDocument());
    expect(screen.getByText('Descarga la app')).toBeInTheDocument();
  });

  it('the server HTML is identical signed in and signed out (Entrar and the download link)', () => {
    const out = renderToString(<NavActions {...labels} hideDownloadWhenSignedIn />);
    document.cookie = 'sb-ref-auth-token=x; path=/';
    auth.userId = 'viewer-1';
    const inn = renderToString(<NavActions {...labels} hideDownloadWhenSignedIn />);
    expect(inn).toBe(out);
    expect(inn).toContain('Descarga la app');
  });
});
