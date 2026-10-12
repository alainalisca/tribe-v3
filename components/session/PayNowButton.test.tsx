import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PayNowButton, { shouldShowPayNow } from './PayNowButton';

describe('shouldShowPayNow', () => {
  it('shows only for a pending athlete who can see the instructions', () => {
    expect(shouldShowPayNow({ canViewPaymentInstructions: true, isCreator: false, isPending: true })).toBe(true);
  });

  it('hides from the instructor', () => {
    expect(shouldShowPayNow({ canViewPaymentInstructions: true, isCreator: true, isPending: false })).toBe(false);
  });

  it('hides from a confirmed athlete', () => {
    expect(shouldShowPayNow({ canViewPaymentInstructions: true, isCreator: false, isPending: false })).toBe(false);
  });

  it('hides when the viewer cannot see the instructions', () => {
    expect(shouldShowPayNow({ canViewPaymentInstructions: false, isCreator: false, isPending: true })).toBe(false);
  });
});

describe('PayNowButton', () => {
  it('opens the first payment link externally, with the direct-payment note', () => {
    render(
      <PayNowButton
        paymentInstructions={'Nequi 300 123 4567 o paga aquí: https://example.com/pago y https://other.com/x'}
        language="es"
      />
    );
    const link = screen.getByRole('link', { name: /Pagar ahora/ });
    expect(link).toHaveAttribute('href', 'https://example.com/pago');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(
      screen.getByText('Pagas directamente al instructor. Después, el instructor confirma tu cupo.')
    ).toBeInTheDocument();
  });

  it('uses English copy', () => {
    render(<PayNowButton paymentInstructions="https://bold.co/a" language="en" />);
    expect(screen.getByRole('link', { name: /Pay now/ })).toBeInTheDocument();
    expect(
      screen.getByText('You pay the instructor directly. The instructor then confirms your spot.')
    ).toBeInTheDocument();
  });

  it('renders nothing without a valid link', () => {
    const { container } = render(<PayNowButton paymentInstructions="Nequi 300 123 4567" language="es" />);
    expect(container).toBeEmptyDOMElement();
    const { container: js } = render(<PayNowButton paymentInstructions="javascript:alert(1)" language="es" />);
    expect(js).toBeEmptyDOMElement();
  });
});
