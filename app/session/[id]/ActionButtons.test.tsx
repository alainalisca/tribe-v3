import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/** T-JOIN1 Part B: no guest door on a paid session (T-PAY3: paid needs an account). */
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es', t: (k: string) => k }) }));
vi.mock('@/components/session/WhatsAppShareButton', () => ({ default: () => null }));
vi.mock('@/components/session/PaidSessionRequest', () => ({ default: () => null }));
vi.mock('@/components/session/CancelSeriesDialog', () => ({ default: () => null }));

import ActionButtons from './ActionButtons';

const actions = {
  guestHasJoined: false,
  joining: false,
  handleJoin: vi.fn(),
  handleLeave: vi.fn(),
  handleCancel: vi.fn(),
  handleCancelOccurrence: vi.fn(),
  handleEndSeries: vi.fn(),
  handleGuestLeave: vi.fn(),
  setShowGuestModal: vi.fn(),
};
const session = {
  id: 's1',
  sport: 'Boxing',
  title: null,
  date: '2030-10-21',
  start_time: '18:30',
  creator: { name: 'Salomon' },
};

function renderSignedOut(over: Record<string, unknown>) {
  render(
    <ActionButtons
      language="es"
      user={null}
      session={{ ...session, ...over }}
      isCreator={false}
      hasJoined={false}
      isPending={false}
      isPast={false}
      isFull={false}
      sessionActions={actions}
      onEdit={vi.fn()}
      onInvite={vi.fn()}
      creatingInvite={false}
    />
  );
}

describe('ActionButtons signed out', () => {
  it('a paid session offers sign-in and back, not the guest button', () => {
    renderSignedOut({ is_paid: true, price_cents: 4000000 });
    expect(screen.queryByText('joinAsGuest')).not.toBeInTheDocument();
    // next/link drops the slash before "?" in tests; trailingSlash adds it back in the app.
    expect(screen.getByRole('link', { name: 'signInToAsk' }).getAttribute('href')).toMatch(
      /^\/auth\/?\?returnTo=%2Fsession%2Fs1%2F$/
    );
  });

  it('a free session keeps the guest button', () => {
    renderSignedOut({ is_paid: false, price_cents: 0 });
    expect(screen.getByText('joinAsGuest')).toBeInTheDocument();
  });
});
