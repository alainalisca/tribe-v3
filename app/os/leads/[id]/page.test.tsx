import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import LeadDetailPage from './page';

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

const TEST_ID = 'test-lead-123';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: TEST_ID }),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => `/os/leads/${TEST_ID}`,
}));

const fetchSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  fetchSpy.mockImplementation((url: string) => {
    if (url.includes('/activities')) {
      return Promise.resolve({
        json: () => Promise.resolve({ success: true, data: [] }),
      });
    }
    return Promise.resolve({
      json: () => Promise.resolve({
        success: true,
        data: {
          id: TEST_ID, full_name: 'Test', status: 'new', source: 'walk_in',
          phone: null, email: null, interest: null, lost_reason: null,
          trial_at: null, next_follow_up_at: null, assigned_to: null,
          converted_client_id: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      }),
    });
  });
  global.fetch = fetchSpy;
});

describe('LeadDetailPage route calls', () => {
  it('calls GET /api/tribe-os/leads/:id on mount', async () => {
    render(<LeadDetailPage />);
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(`/api/tribe-os/leads/${TEST_ID}`);
    });
  });

  it('calls GET /api/tribe-os/leads/:id/activities on mount', async () => {
    render(<LeadDetailPage />);
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(`/api/tribe-os/leads/${TEST_ID}/activities`);
    });
  });
});
