import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import LeadsPage from './page';

vi.mock('@/lib/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en' as const }),
}));

vi.mock('@/hooks/useTribeOSPremiumGate', () => ({
  useTribeOSPremiumGate: () => ({ state: 'allowed' as const }),
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('@/lib/toast', () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/os/leads',
}));

const fetchSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  fetchSpy.mockImplementation((url: string) => {
    if (url.includes('/stats')) {
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, data: { total: 0, by_status: {}, new_last_30d: 0 } }),
      });
    }
    return Promise.resolve({
      json: () => Promise.resolve({ success: true, data: [] }),
    });
  });
  global.fetch = fetchSpy;
});

describe('LeadsPage route calls', () => {
  it('calls GET /api/tribe-os/leads on mount', async () => {
    render(<LeadsPage />);
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/tribe-os/leads');
    });
  });

  it('calls GET /api/tribe-os/leads/stats on mount', async () => {
    render(<LeadsPage />);
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/tribe-os/leads/stats');
    });
  });
});
