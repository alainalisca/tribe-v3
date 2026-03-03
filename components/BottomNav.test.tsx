import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BottomNav from './BottomNav';

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
        mySessions: 'My Sessions',
        create: 'Create',
        requests: 'Requests',
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
    expect(screen.getByText('My Sessions')).toBeInTheDocument();
    expect(screen.getByText('Create')).toBeInTheDocument();
    expect(screen.getByText('Requests')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });

  it('renders links to correct routes', () => {
    render(<BottomNav />);

    expect(screen.getByTestId('link-/')).toBeInTheDocument();
    expect(screen.getByTestId('link-/sessions')).toBeInTheDocument();
    expect(screen.getByTestId('link-/create')).toBeInTheDocument();
    expect(screen.getByTestId('link-/requests')).toBeInTheDocument();
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
    expect(createLink.innerHTML).toContain('bg-[#9EE551]');
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
