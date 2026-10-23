import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

/** T-POLISH1 PR 3b-1: the storefront's actions as one island on /i and /g. */
const auth = vi.hoisted(() => ({ user: null as { id: string } | null, pending: false }));
const dal = vi.hoisted(() => ({
  followUser: vi.fn(async () => ({ success: true })),
  unfollowUser: vi.fn(async () => ({ success: true })),
  following: false,
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: () => (auth.pending ? new Promise(() => {}) : Promise.resolve({ data: { user: auth.user } })),
    },
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: dal.following ? { follower_id: 'x' } : null, error: null }),
      };
      return q;
    },
  }),
}));
vi.mock('@/lib/dal/promote', () => ({
  followUser: (...a: unknown[]) => dal.followUser(...(a as [])),
  unfollowUser: (...a: unknown[]) => dal.unfollowUser(...(a as [])),
  followNotificationMessage: () => 'followed you',
}));
vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/components/instructor/InterestButton', () => ({
  default: ({ instructorId, athleteId }: { instructorId: string; athleteId: string }) => (
    <button type="button" data-testid="interest" data-instructor={instructorId} data-athlete={athleteId}>
      Estoy interesado
    </button>
  ),
}));
vi.mock('@/components/BlockReportControls', () => ({
  default: ({ targetUserId }: { targetUserId: string }) => <div data-testid="block-report">{targetUserId}</div>,
}));

import PublicProfileActions from './PublicProfileActions';

const COACH = '11111111-1111-4111-8111-111111111111';
const props = {
  targetId: COACH,
  targetName: 'Salomon',
  pagePath: '/i/salotaba/',
  showInterest: true,
  specialties: ['Boxing'],
  language: 'es' as const,
  variant: 'site' as const,
  labels: { message: 'Enviar mensaje', follow: 'Seguir', following: 'Siguiendo', interested: 'Estoy interesado' },
};
// next/link prints "/auth?…" under vitest (no next.config trailingSlash) and "/auth/?…" in the app.
const norm = (h: string | null) => (h ?? '').replace(/\/\?/g, '?');
const hrefOf = (name: string) => norm(screen.getByRole('link', { name }).getAttribute('href'));

beforeEach(() => {
  auth.user = null;
  auth.pending = false;
  dal.following = false;
  dal.followUser.mockClear();
  dal.unfollowUser.mockClear();
});

describe('the server HTML is the same for everyone: the signed-out version', () => {
  it('renders sign-in links and no per-viewer control', () => {
    auth.user = { id: 'viewer-1' }; // even with a session, the server never knows it
    const html = norm(renderToString(<PublicProfileActions {...props} />));
    expect(html).toContain('data-viewer="out"');
    expect(html).toContain('/auth?returnTo=%2Fmessages%2F%3Fuser%3D' + COACH);
    expect(html).toContain('/auth?returnTo=%2Fi%2Fsalotaba%2F');
    expect(html).not.toContain('block-report');
    expect(html).not.toContain('viewer-1');
  });
});

describe('signed out', () => {
  it('every action goes to sign-in, then back here (Mensaje straight to the conversation)', async () => {
    render(<PublicProfileActions {...props} />);
    await waitFor(() => expect(screen.getByTestId('public-profile-actions').dataset.viewer).toBe('out'));
    expect(hrefOf('Enviar mensaje')).toBe(`/auth?returnTo=${encodeURIComponent(`/messages/?user=${COACH}`)}`);
    expect(hrefOf('Seguir')).toBe('/auth?returnTo=%2Fi%2Fsalotaba%2F');
    expect(hrefOf('Estoy interesado')).toBe('/auth?returnTo=%2Fi%2Fsalotaba%2F');
    expect(screen.queryByTestId('block-report')).toBeNull();
    expect(screen.queryByTestId('interest')).toBeNull();
  });
});

describe('signed in', () => {
  beforeEach(() => {
    auth.user = { id: 'viewer-1' };
  });

  it('opens the conversation, offers Seguir, the interest form and Bloquear / Reportar', async () => {
    render(<PublicProfileActions {...props} />);
    await waitFor(() => expect(screen.getByTestId('public-profile-actions').dataset.viewer).toBe('in'));
    expect(hrefOf('Enviar mensaje')).toBe(`/messages?user=${COACH}`);
    expect(screen.getByRole('button', { name: 'Seguir' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('interest').dataset.athlete).toBe('viewer-1');
    expect(screen.getByTestId('block-report').textContent).toBe(COACH);
  });

  it('Seguir follows through the same DAL call as the storefront, and shows Siguiendo', async () => {
    render(<PublicProfileActions {...props} />);
    const follow = await screen.findByRole('button', { name: 'Seguir' });
    await act(async () => {
      fireEvent.click(follow);
    });
    expect(dal.followUser).toHaveBeenCalledWith(expect.anything(), 'viewer-1', COACH, 'followed you');
    expect(screen.getByRole('button', { name: 'Siguiendo' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('reads the follow state, and unfollows', async () => {
    dal.following = true;
    render(<PublicProfileActions {...props} />);
    const following = await screen.findByRole('button', { name: 'Siguiendo' });
    await act(async () => {
      fireEvent.click(following);
    });
    expect(dal.unfollowUser).toHaveBeenCalledWith(expect.anything(), 'viewer-1', COACH);
    expect(screen.getByRole('button', { name: 'Seguir' })).toBeInTheDocument();
  });

  it('no Estoy interesado on a gym page', async () => {
    render(<PublicProfileActions {...props} showInterest={false} variant="app" />);
    await waitFor(() => expect(screen.getByTestId('public-profile-actions').dataset.viewer).toBe('in'));
    expect(screen.queryByTestId('interest')).toBeNull();
  });

  it('shows nothing to the account owner', async () => {
    auth.user = { id: COACH };
    const { container } = render(<PublicProfileActions {...props} />);
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });
});
