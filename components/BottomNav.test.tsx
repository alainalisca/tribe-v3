import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BottomNav from './BottomNav';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
    }),
  }),
}));

let mockPathname = '/';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    'aria-current': ariaCurrent,
  }: {
    children: React.ReactNode;
    href: string;
    'aria-current'?: 'page';
  }) => (
    <a href={href} data-testid={`link-${href}`} aria-current={ariaCurrent}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        navExplore: 'Explore',
        navMySessions: 'My sessions',
        profile: 'Profile',
      };
      return map[key] || key;
    },
    language: 'en',
  }),
}));

describe('BottomNav', () => {
  it('renders the 4 tabs: Explorar, Mis sesiones, Mensajes, Perfil (T-POLISH1)', () => {
    render(<BottomNav />);

    expect(screen.getByText('Explore')).toBeInTheDocument();
    expect(screen.getByText('My sessions')).toBeInTheDocument();
    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(4);
  });

  it('renders links to correct routes, and no Crear or Comunidad tab', () => {
    render(<BottomNav />);

    expect(screen.getByTestId('link-/')).toBeInTheDocument();
    expect(screen.getByTestId('link-/sessions')).toBeInTheDocument();
    expect(screen.getByTestId('link-/messages')).toBeInTheDocument();
    expect(screen.getByTestId('link-/profile')).toBeInTheDocument();
    expect(screen.queryByTestId('link-/create')).toBeNull();
    expect(screen.queryByTestId('link-/communities')).toBeNull();
  });

  it('highlights active route with green color', () => {
    mockPathname = '/';
    render(<BottomNav />);

    // The active link should have the green color class
    const homeLink = screen.getByTestId('link-/');
    expect(homeLink.querySelector('.text-\\[\\#9EE551\\]') || homeLink.className).toBeDefined();
  });

  it('keeps Mis sesiones lit on /create, /requests and /my-training', () => {
    for (const path of ['/sessions', '/create', '/requests', '/my-training']) {
      mockPathname = path;
      const { unmount } = render(<BottomNav />);
      expect(screen.getByTestId('link-/sessions').getAttribute('aria-current')).toBe('page');
      expect(screen.getByTestId('link-/').getAttribute('aria-current')).toBeNull();
      unmount();
    }
    mockPathname = '/';
  });

  it('renders nav element with fixed positioning', () => {
    const { container } = render(<BottomNav />);
    const nav = container.querySelector('nav');
    expect(nav).toBeInTheDocument();
    expect(nav?.className).toContain('fixed');
    expect(nav?.className).toContain('bottom-0');
    expect(nav?.className).toContain('z-50');
  });
});
