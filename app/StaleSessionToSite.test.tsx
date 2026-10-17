import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';

const getUser = vi.fn();
const signOut = vi.fn();
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getUser, signOut } }) }));

import StaleSessionToSite from './StaleSessionToSite';

/**
 * T-SITE1. `/` with an expired session cookie: the feed's signed-out branch
 * clears the stale session and reloads `/`, where middleware serves Inicio.
 */
const location = { pathname: '/', search: '?src=ig', reload: vi.fn(), replace: vi.fn() };

describe('StaleSessionToSite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    Object.defineProperty(window, 'location', { value: location, writable: true });
    signOut.mockResolvedValue({ error: null });
  });

  it('clears the dead session and loads `/` again, query kept', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthApiError('invalid JWT', 401, 'bad_jwt') });
    render(<StaleSessionToSite>splash</StaleSessionToSite>);
    await waitFor(() => expect(location.replace).toHaveBeenCalledWith('/?src=ig'));
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('shows the feed when the user turns out to be signed in', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    render(<StaleSessionToSite>splash</StaleSessionToSite>);
    await waitFor(() => expect(location.reload).toHaveBeenCalled());
    expect(signOut).not.toHaveBeenCalled();
  });

  it('signs nobody out on a network failure', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError('Failed to fetch', 0) });
    render(<StaleSessionToSite>splash</StaleSessionToSite>);
    await new Promise((r) => setTimeout(r, 20));
    expect(signOut).not.toHaveBeenCalled();
    expect(location.replace).not.toHaveBeenCalled();
  });

  it('stops at /auth instead of looping when the cookie will not clear', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    window.sessionStorage.setItem('tribe_stale_session_attempt', `2:${Date.now()}`);
    render(<StaleSessionToSite>splash</StaleSessionToSite>);
    await waitFor(() => expect(location.replace).toHaveBeenCalledWith('/auth/'));
    expect(signOut).not.toHaveBeenCalled();
  });

  it('renders its children (the splash) meanwhile', () => {
    getUser.mockReturnValue(new Promise(() => {}));
    const { getByText } = render(<StaleSessionToSite>splash</StaleSessionToSite>);
    expect(getByText('splash')).toBeTruthy();
  });
});
