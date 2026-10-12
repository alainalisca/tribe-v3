import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PendingPayBar, { shouldShowPendingPayBar, PAYMENT_BOX_ID } from './PendingPayBar';

const pendingPaid = { canViewPaymentInstructions: true, isCreator: false, isPending: true, isPaidSession: true };

describe('shouldShowPendingPayBar', () => {
  it('shows for a pending athlete on a paid session who can see the instructions', () => {
    expect(shouldShowPendingPayBar(pendingPaid)).toBe(true);
  });

  it.each([
    ['the host', { isCreator: true, isPending: false }],
    ['a confirmed athlete', { isPending: false }],
    ['a logged-out visitor', { canViewPaymentInstructions: false, isPending: false }],
    ['a free session', { isPaidSession: false }],
  ])('never shows for %s', (_label, override) => {
    expect(shouldShowPendingPayBar({ ...pendingPaid, ...override })).toBe(false);
  });
});

describe('PendingPayBar', () => {
  it('shows the price, "Pendiente de pago" and "Pagar ahora" opening the first link externally', () => {
    render(
      <PendingPayBar
        priceCents={3500000}
        currency="COP"
        paymentInstructions="Nequi 300 123 4567 o paga aquí: https://example.com/pago"
        language="es"
      />
    );
    expect(screen.getByText(/35\.000/)).toBeInTheDocument();
    expect(screen.getByText('Pendiente de pago')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Pagar ahora/ });
    expect(link).toHaveAttribute('href', 'https://example.com/pago');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows "Cómo pagar" without a link, which scrolls to the payment box', () => {
    const box = document.createElement('div');
    box.id = PAYMENT_BOX_ID;
    box.scrollIntoView = vi.fn();
    document.body.appendChild(box);

    render(
      <PendingPayBar priceCents={3500000} currency="COP" paymentInstructions="Nequi 300 123 4567" language="es" />
    );
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Cómo pagar/ }));
    expect(box.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });

    box.remove();
  });

  it('still shows "Cómo pagar" when the instructions are missing, rather than hiding', () => {
    render(<PendingPayBar priceCents={3500000} currency="COP" paymentInstructions={null} language="es" />);
    expect(screen.getByRole('button', { name: /Cómo pagar/ })).toBeInTheDocument();
  });

  it('uses English copy', () => {
    render(<PendingPayBar priceCents={3500000} currency="COP" paymentInstructions="https://bold.co/a" language="en" />);
    expect(screen.getByText('Payment pending')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Pay now/ })).toBeInTheDocument();
  });
});
