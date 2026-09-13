import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import FeedbackWidget from './FeedbackWidget';

/**
 * T-GYM3b, same class as NAV-02.
 *
 * FeedbackWidget is an internal tool: it writes to user_feedback and asks for a
 * bug category. Offering it to a stranger who arrived from a gym's Instagram
 * bio is the same leak the install modal was, on the same surfaces.
 *
 * BOTH halves are asserted. A suppression that leaked would silently delete the
 * feedback channel across the whole app, and nothing else in this repo watches
 * for that.
 */

let mockPathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => mockPathname }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'en', t: (k: string) => k }) }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } }),
}));

describe('FeedbackWidget route suppression', () => {
  beforeEach(() => {
    mockPathname = '/';
  });

  it.each([
    ['/g/bullbox/'],
    ['/g/040cbc21-1b11-4ae1-aa99-9fe35a32bda0/'],
    ['/i/eaff348f-5df3-4df5-bd80-69ec233aad0e/'],
    ['/invite/abc123'],
  ])('renders nothing on %s', (pathname) => {
    mockPathname = pathname;
    const { container } = render(<FeedbackWidget />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([['/home'], ['/sessions'], ['/storefront/040cbc21-1b11-4ae1-aa99-9fe35a32bda0/'], ['/instructors']])(
    'still renders on %s, so the feedback channel survives',
    (pathname) => {
      mockPathname = pathname;
      const { container } = render(<FeedbackWidget />);
      expect(container).not.toBeEmptyDOMElement();
    }
  );
});
