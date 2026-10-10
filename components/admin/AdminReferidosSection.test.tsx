import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/i18n/useTranslations', () => ({ useTranslations: () => (k: string) => k }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));

import AdminReferidosSection from './AdminReferidosSection';
import { showError } from '@/lib/toast';
import { logError } from '@/lib/logger';

const ROWS = [
  { code: 'KQ7M2Z', kind: 'lead', referrer: 'Ana', leads: 2, attended: 1, signups: 0, selfExcluded: 1 },
  { code: 'ZZZZZZ', kind: 'unknown', referrer: null, leads: 1, attended: 0, signups: 0, selfExcluded: 0 },
];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: ROWS }) }) as unknown as Response);
  vi.stubGlobal('fetch', fetchMock);
});

describe('AdminReferidosSection', () => {
  it('asks for tab=referidos on the range it is given, and renders every count including Self', async () => {
    render(<AdminReferidosSection range={7} />);
    expect(await screen.findByText('Ana')).toBeTruthy();
    expect(String(fetchMock.mock.calls[0][0])).toContain('tab=referidos');
    expect(String(fetchMock.mock.calls[0][0])).toContain('days=7');
    const cells = screen.getAllByRole('row')[1].querySelectorAll('td');
    expect([...cells].map((c) => c.textContent)).toEqual(['Ana', 'KQ7M2Z', '2', '1', '0', '1']);
  });

  it('labels a code nobody owns instead of dropping it', async () => {
    render(<AdminReferidosSection range={null} />);
    expect(await screen.findByText('unknownReferrer')).toBeTruthy();
    expect(String(fetchMock.mock.calls[0][0])).toContain('days=all');
  });

  it('says there are none when there are none', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) } as unknown as Response);
    render(<AdminReferidosSection range={30} />);
    expect(await screen.findByText('referidosEmpty')).toBeTruthy();
  });

  it('recognises a failed load: logged and reported, not rendered as "no referrals"', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
    render(<AdminReferidosSection range={30} />);
    await waitFor(() => expect(showError).toHaveBeenCalledWith('loadError'));
    expect(logError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ action: 'AdminReferidosSection.load' }));
    expect(screen.queryByText('referidosEmpty')).toBeNull();
  });
});
