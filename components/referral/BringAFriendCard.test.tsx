/**
 * The card's three actions, each asserted by OUTCOME: the link WhatsApp opens,
 * what lands on the clipboard, and the share_click row's body. Not merely that
 * a handler ran.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
vi.mock('@/lib/attribution', () => ({ getSessionKey: () => 'abcdef0123456789' }));

import BringAFriendCard from './BringAFriendCard';
import { SITE_URL } from '@/lib/http/siteUrl';

let fetchMock: ReturnType<typeof vi.fn>;
let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true }) as Response);
  vi.stubGlobal('fetch', fetchMock);
  writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'share');
});

function shareClickBody() {
  const call = fetchMock.mock.calls.find(([url]) => url === '/api/attr/');
  return call ? JSON.parse((call[1] as RequestInit).body as string) : null;
}

describe('BringAFriendCard', () => {
  it('session, in English: WhatsApp carries the /s/ link with the code, and logs a share_click', () => {
    render(
      <BringAFriendCard context={{ kind: 'session', sessionId: 's1', title: 'HYROX' }} code="TRIBE-AB2CD" language="en" />
    );
    const wa = screen.getByRole('link', { name: /Share on WhatsApp/ });
    expect(decodeURIComponent((wa.getAttribute('href') ?? '').replace('https://wa.me/?text=', ''))).toBe(
      `I'm training HYROX with Tribe. Come with me: ${SITE_URL}/s/s1/?ref=TRIBE-AB2CD&src=referral`
    );
    fireEvent.click(wa);
    expect(shareClickBody()).toMatchObject({
      event_type: 'share_click',
      ref: 'TRIBE-AB2CD',
      src: 'referral',
      utm_source: 'whatsapp',
      session_key: 'abcdef0123456789',
    });
  });

  it('Copiar enlace copies the LINK, not the message, and says so', async () => {
    render(<BringAFriendCard context={{ kind: 'profile' }} code="TRIBE-AB2CD" language="es" />);
    fireEvent.click(screen.getByRole('button', { name: /Copiar enlace/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${SITE_URL}/?ref=TRIBE-AB2CD&src=referral`));
    expect(await screen.findByText('Enlace copiado')).toBeTruthy();
    expect(shareClickBody()).toMatchObject({ utm_source: 'copy' });
  });

  it('offers the native sheet only where the device has one', async () => {
    const { unmount } = render(<BringAFriendCard context={{ kind: 'profile' }} code="C" language="es" />);
    expect(screen.queryByRole('button', { name: 'Compartir' })).toBeNull();
    unmount();

    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    render(<BringAFriendCard context={{ kind: 'profile' }} code="TRIBE-AB2CD" language="es" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Compartir' }));
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: `${SITE_URL}/?ref=TRIBE-AB2CD&src=referral` })));
  });
});
