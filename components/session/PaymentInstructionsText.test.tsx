import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PaymentInstructionsText from './PaymentInstructionsText';

describe('PaymentInstructionsText', () => {
  it('renders a payment URL as an external link and keeps the rest as text', () => {
    const { container } = render(
      <PaymentInstructionsText text={'Nequi 300 123 4567 o paga aquí: https://example.com/pago.'} />
    );
    const link = screen.getByRole('link', { name: 'https://example.com/pago' });
    expect(link).toHaveAttribute('href', 'https://example.com/pago');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(container.textContent).toBe('Nequi 300 123 4567 o paga aquí: https://example.com/pago.');
  });

  it('renders a javascript: URL as plain text, not a link', () => {
    render(<PaymentInstructionsText text="javascript:alert(1)" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
  });

  it('never interprets the text as HTML', () => {
    const { container } = render(<PaymentInstructionsText text={'<img src=x onerror=alert(1)> https://bold.co/a'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
