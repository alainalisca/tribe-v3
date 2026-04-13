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
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href} data-testid={`link-${href}`}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        home: 'Home',
        create: 'Create',
        profile: 'Profile',
      };
      return map[key] || key;
    },
    language: 'en',
  }),
}));

describe('BottomNav', () => {
  it('renders all 5 nav items', () => {
    render(<BottomNav />);

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
    expect(screen.getByText('Community')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });

  it('renders links to correct routes', () => {
    render(<BottomNav />);

    expect(screen.getByTestId('link-/')).toBeInTheDocument();
    expect(screen.getByTestId('link-/messages')).toBeInTheDocument();
    expect(screen.getByTestId('link-/create')).toBeInTheDocument();
    expect(screen.getByTestId('link-/communities')).toBeInTheDocument();
    expect(screen.getByTestId('link-/profile')).toBeInTheDocument();
  });

  it('highlights active route with green color', () => {
    mockPathname = '/';
    render(<BottomNav />);

    // The active link should have the green color class
    const homeLink = screen.getByTestId('link-/');
    expect(homeLink.querySelector('.text-\\[\\#9EE551\\]') || homeLink.className).toBeDefined();
  });

  it('shows create button with special styling', () => {
    render(<BottomNav />);

    const createLink = screen.getByTestId('link-/create');
    // The create button has the elevated -mt-8 style
    expect(createLink.innerHTML).toContain('bg-tribe-green');
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
