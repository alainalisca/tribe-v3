import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es', t: (k: string) => k }) }));
const share = vi.hoisted(() => ({ result: 'unavailable' as string, copied: [] as string[] }));
vi.mock('@/lib/share', () => ({
  getSessionShareUrl: (id: string) => `https://tribelatam.com/session/${id}/`,
  nativeShare: vi.fn(async () => share.result),
  copyToClipboard: vi.fn(async (t: string) => {
    share.copied.push(t);
    return true;
  }),
}));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn() }));

import AthleteShareButton from './AthleteShareButton';
import { nativeShare } from '@/lib/share';

/** T-UI-SD1: the phone's share sheet when there is one; otherwise "Copiar enlace" and "WhatsApp". */
beforeEach(() => {
  share.copied = [];
  vi.clearAllMocks();
});

describe('AthleteShareButton', () => {
  it('uses the native share sheet when it works, with no menu', async () => {
    share.result = 'shared';
    render(<AthleteShareButton sessionId="s1" title="Boxeo con Salomon" />);
    fireEvent.click(screen.getByRole('button', { name: 'Compartir' }));
    await waitFor(() =>
      expect(nativeShare).toHaveBeenCalledWith({
        title: 'Boxeo con Salomon — Únete en Tribe',
        url: 'https://tribelatam.com/session/s1/',
      })
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('a cancelled share sheet opens nothing', async () => {
    share.result = 'cancelled';
    render(<AthleteShareButton sessionId="s1" title="Boxeo con Salomon" />);
    fireEvent.click(screen.getByRole('button', { name: 'Compartir' }));
    await waitFor(() => expect(nativeShare).toHaveBeenCalled());
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it.each(['unavailable', 'failed'])('native %s: a menu with Copiar enlace and WhatsApp', async (result) => {
    share.result = result;
    render(<AthleteShareButton sessionId="s1" title="Boxeo con Salomon" />);
    fireEvent.click(screen.getByRole('button', { name: 'Compartir' }));
    const menu = await screen.findByRole('menu');
    const wa = screen.getByRole('menuitem', { name: 'WhatsApp' });
    expect(decodeURIComponent(wa.getAttribute('href') ?? '')).toBe(
      'https://wa.me/?text=Boxeo con Salomon — Únete en Tribe https://tribelatam.com/session/s1/'
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copiar enlace' }));
    await waitFor(() => expect(share.copied).toEqual(['https://tribelatam.com/session/s1/']));
    expect(menu).not.toBeInTheDocument();
  });
});
