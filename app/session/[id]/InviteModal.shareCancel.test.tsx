/**
 * T-ANALYTICS1: the invite modal's share button tracks a share only once the
 * sheet reports one. It used to fire session_shared on tap, before the sheet
 * even opened, so every cancel was counted as a share.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const trackEvent = vi.fn();
vi.mock('@/lib/analytics', () => ({ trackEvent: (...a: unknown[]) => trackEvent(...a) }));
vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ t: (k: string) => k, language: 'es' }) }));

import InviteModal from './InviteModal';

const share = vi.fn();
const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { share, clipboard: { writeText } });
});
afterEach(() => vi.unstubAllGlobals());

function openAndShare() {
  render(
    <InviteModal
      language="es"
      inviteLink="https://tribelatam.com/invite/abc"
      session={{ id: 's1', sport: 'Other', location: 'Laureles' }}
      onClose={vi.fn()}
    />
  );
  // The share button is the one that is not "copy".
  const buttons = screen.getAllByRole('button');
  const shareButton = buttons.find((b) => /share|compart/i.test(b.textContent ?? ''))!;
  fireEvent.click(shareButton);
}

describe('InviteModal share', () => {
  it('a cancelled sheet sends no share event, copies nothing and throws nothing', async () => {
    share.mockRejectedValue(new DOMException('Share canceled', 'AbortError'));
    openAndShare();
    await waitFor(() => expect(share).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(trackEvent).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('a completed share is tracked after the sheet reports it', async () => {
    share.mockResolvedValue(undefined);
    openAndShare();
    await waitFor(() =>
      expect(trackEvent).toHaveBeenCalledWith('session_shared', expect.objectContaining({ channel: 'native' }))
    );
  });
});
