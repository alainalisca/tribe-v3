import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

/** T-POLISH1 PR 3b-2: the app's tab bar on /i and /g, for a signed-in viewer only. */
const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: auth.user } }) } }),
}));
vi.mock('@/components/BottomNav', () => ({ default: () => <nav data-testid="bottom-nav" /> }));

import SignedInTabBar from './SignedInTabBar';

beforeEach(() => {
  auth.user = null;
});

describe('SignedInTabBar', () => {
  it('mounts the bar, and its spacer, once the viewer is known to be signed in', async () => {
    auth.user = { id: 'viewer-1' };
    render(<SignedInTabBar spacer />);
    expect(await screen.findByTestId('bottom-nav')).toBeInTheDocument();
    expect(screen.getByTestId('tab-bar-spacer').style.height).toBe('var(--bottom-nav-h)');
  });

  it('renders nothing signed out: the public page stays exactly as it was', async () => {
    const { container } = render(<SignedInTabBar spacer />);
    await waitFor(() => expect(container.innerHTML).toBe(''));
    expect(screen.queryByTestId('bottom-nav')).toBeNull();
  });

  it('no spacer where the page already keeps the room (/g)', async () => {
    auth.user = { id: 'viewer-1' };
    render(<SignedInTabBar />);
    await screen.findByTestId('bottom-nav');
    expect(screen.queryByTestId('tab-bar-spacer')).toBeNull();
  });

  it('the server HTML is identical signed in and signed out (nothing, either way)', () => {
    auth.user = null;
    const out = renderToString(<SignedInTabBar spacer />);
    auth.user = { id: 'viewer-1' };
    const inn = renderToString(<SignedInTabBar spacer />);
    expect(inn).toBe(out);
    expect(inn).toBe('');
  });
});
