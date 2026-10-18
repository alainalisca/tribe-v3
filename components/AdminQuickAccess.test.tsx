import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/**
 * The admin shield (restored 2026-10-18): only when is_app_admin() says so.
 * Coaches, athletes, signed-out visitors and a failed check see nothing.
 */
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es' }) }));
const auth = { user: null as null | { id: string } };
const rpc = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: auth.user } }) }, rpc }),
}));

import AdminQuickAccess from './AdminQuickAccess';

beforeEach(() => {
  rpc.mockReset();
  auth.user = null;
});

async function settle(container: HTMLElement) {
  await waitFor(() => expect(rpc.mock.calls.length + (auth.user ? 0 : 1)).toBeGreaterThan(0));
  await new Promise((r) => setTimeout(r, 0));
  return container;
}

describe('AdminQuickAccess', () => {
  it('an admin sees the shield, linking to /admin, checked through is_app_admin()', async () => {
    auth.user = { id: 'admin' };
    rpc.mockResolvedValue({ data: true, error: null });
    render(<AdminQuickAccess />);
    const link = await screen.findByRole('link', { name: 'Panel de Admin' });
    expect(link).toHaveAttribute('href', '/admin');
    expect(rpc).toHaveBeenCalledWith('is_app_admin');
  });

  it.each([
    ['a coach', { id: 'coach' }],
    ['an athlete', { id: 'athlete' }],
  ])('%s sees nothing', async (_who, user) => {
    auth.user = user;
    rpc.mockResolvedValue({ data: false, error: null });
    const { container } = render(<AdminQuickAccess />);
    await settle(container);
    expect(container).toBeEmptyDOMElement();
  });

  it('a signed-out visitor sees nothing, and no admin check is made', async () => {
    const { container } = render(<AdminQuickAccess />);
    await settle(container);
    expect(container).toBeEmptyDOMElement();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a failed check shows nothing (fails closed)', async () => {
    auth.user = { id: 'x' };
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { container } = render(<AdminQuickAccess />);
    await settle(container);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the check is still running (no empty gap for non-admins)', () => {
    auth.user = { id: 'x' };
    rpc.mockReturnValue(new Promise(() => {}));
    const { container } = render(<AdminQuickAccess />);
    expect(container).toBeEmptyDOMElement();
  });
});
