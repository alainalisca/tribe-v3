import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PaymentSheet from './PaymentSheet';

const props = {
  open: true,
  sport: 'Running',
  date: '2099-01-15',
  priceCents: 3500000,
  currency: 'COP',
  paymentInstructions: 'Nequi 300 123 4567 o paga aquí: https://example.com/pago',
  language: 'es' as const,
};

describe('PaymentSheet', () => {
  it('is an accessible dialog with the request-sent copy, price, instructions and "Pagar ahora"', () => {
    render(<PaymentSheet {...props} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('data-modal', 'true');
    expect(screen.getByText('¡Solicitud enviada!')).toBeInTheDocument();
    expect(screen.getByText('Último paso: paga a tu coach para asegurar tu cupo.')).toBeInTheDocument();
    expect(screen.getByText(/35\.000/)).toBeInTheDocument();
    expect(screen.getByText(/Nequi 300 123 4567/)).toBeInTheDocument();
    expect(screen.getByText(/Tribe no procesa, retiene ni reembolsa este pago/)).toBeInTheDocument();
    const pay = screen.getByRole('link', { name: /Pagar ahora/ });
    expect(pay).toHaveAttribute('href', 'https://example.com/pago');
    expect(pay).toHaveAttribute('target', '_blank');
    expect(pay).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('"Pagaré después" closes it, and is what the Android back button presses', () => {
    const onClose = vi.fn();
    render(<PaymentSheet {...props} onClose={onClose} />);
    const later = screen.getByRole('button', { name: 'Pagaré después' });
    expect(later).toHaveAttribute('data-modal-close', 'true');
    fireEvent.click(later);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape closes it', () => {
    const onClose = vi.fn();
    render(<PaymentSheet {...props} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('without a link shows "Entendido", which closes it', () => {
    const onClose = vi.fn();
    render(<PaymentSheet {...props} paymentInstructions="Nequi 300 123 4567" onClose={onClose} />);
    expect(screen.queryByRole('link', { name: /Pagar ahora/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing while closed', () => {
    render(<PaymentSheet {...props} open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('uses English copy', () => {
    render(<PaymentSheet {...props} language="en" onClose={vi.fn()} />);
    expect(screen.getByText('Request sent!')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Pay now/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "I'll pay later" })).toBeInTheDocument();
  });
});
