import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es', t: (k: string) => k }) }));

import SessionActionBar from './SessionActionBar';

/** T-UI-SD1: one primary action per role, pinned to the bottom. Real Spanish copy. */
const athlete = {
  role: 'athlete' as const,
  isPaid: false,
  joining: false,
  onJoin: vi.fn(),
  onLeave: vi.fn(),
  paid: null,
  language: 'es' as const,
};

describe('SessionActionBar', () => {
  it('host, upcoming: Compartir first, then Gestionar', () => {
    const onShare = vi.fn();
    const onManage = vi.fn();
    render(<SessionActionBar role="host" isPast={false} onShare={onShare} onManage={onManage} />);
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual(['Compartir', 'Gestionar']);
    fireEvent.click(screen.getByRole('button', { name: 'Compartir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gestionar' }));
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onManage).toHaveBeenCalledTimes(1);
  });

  it('host, after the session: Gestionar only', () => {
    render(<SessionActionBar role="host" isPast onShare={vi.fn()} onManage={vi.fn()} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Gestionar']);
  });

  it('athlete, not booked: one "Reservar" that books', () => {
    const onJoin = vi.fn();
    render(<SessionActionBar {...athlete} state="book" onJoin={onJoin} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reservar' }));
    expect(onJoin).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('athlete, booked: "Ya estás dentro" and "Cancelar mi cupo"', () => {
    const onLeave = vi.fn();
    render(<SessionActionBar {...athlete} state="joined" onLeave={onLeave} />);
    expect(screen.getByText('Ya estás dentro')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar mi cupo' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('athlete, pending on a paid session: says it is waiting for payment, and can withdraw', () => {
    render(<SessionActionBar {...athlete} state="pending" isPaid />);
    expect(screen.getByText('Esperando confirmación de pago')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar solicitud' })).toBeInTheDocument();
  });

  it('athlete, paid: "Solicitar unirse" with no second price box (the price lives in the facts)', () => {
    render(
      <SessionActionBar
        {...athlete}
        state="request"
        isPaid
        paid={{ priceCents: 2500000, currency: 'COP', paymentInstructions: null, canViewPaymentInstructions: false }}
      />
    );
    expect(screen.getByRole('button', { name: /Solicitar unirse/ })).toBeInTheDocument();
    expect(screen.queryByText('Sesión de pago')).not.toBeInTheDocument();
    expect(screen.queryByText(/25\.000/)).not.toBeInTheDocument();
  });

  it.each([
    ['full', 'Sesión llena'],
    ['ended', 'Terminó'],
    ['invite_only', 'Solo con invitación'],
  ] as const)('athlete, %s: a status, nothing to press', (state, label) => {
    render(<SessionActionBar {...athlete} state={state} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('is pinned to the bottom edge', () => {
    render(<SessionActionBar {...athlete} state="book" />);
    expect(screen.getByTestId('session-action-bar').className).toContain('fixed bottom-0');
  });
});
