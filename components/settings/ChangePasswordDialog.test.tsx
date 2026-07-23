/**
 * Render tests for ChangePasswordDialog.
 *
 * The case that matters most: ~21 of 76 production accounts sign in with Apple
 * or Google and have no Tribe password at all. Those users must see the row
 * DISABLED with a reason naming their provider, not a form that cannot work and
 * not a silently missing row.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChangePasswordDialog from './ChangePasswordDialog';

let mockLanguage: 'en' | 'es' = 'en';
vi.mock('@/lib/LanguageContext', () => ({
  useLanguage: () => ({ language: mockLanguage, setLanguage: vi.fn(), t: (k: string) => k }),
}));

beforeEach(() => {
  mockLanguage = 'en';
  vi.clearAllMocks();
});

describe('OAuth accounts — disabled with an explanation', () => {
  it('Apple: shows the row disabled and names Apple', () => {
    render(<ChangePasswordDialog provider="apple" onSubmit={vi.fn()} />);

    const button = screen.getByRole('button', { name: /change password/i });
    expect(button).toBeDisabled();
    expect(screen.getByText(/managed by Apple/i)).toBeInTheDocument();
  });

  it('Google: shows the row disabled and names Google', () => {
    render(<ChangePasswordDialog provider="google" onSubmit={vi.fn()} />);

    expect(screen.getByRole('button', { name: /change password/i })).toBeDisabled();
    expect(screen.getByText(/managed by Google/i)).toBeInTheDocument();
  });

  it('the row is present, not hidden — a missing row would read as a bug', () => {
    render(<ChangePasswordDialog provider="apple" onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: /change password/i })).toBeInTheDocument();
  });

  it('clicking the disabled row opens no dialog and calls nothing', () => {
    const onSubmit = vi.fn();
    render(<ChangePasswordDialog provider="google" onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: /change password/i }));

    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Spanish: the Apple explanation is localized', () => {
    mockLanguage = 'es';
    render(<ChangePasswordDialog provider="apple" onSubmit={vi.fn()} />);
    expect(screen.getByText(/la maneja Apple/i)).toBeInTheDocument();
  });
});

describe('email accounts — the form', () => {
  it('opens a three-field form', async () => {
    render(<ChangePasswordDialog provider="email" onSubmit={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => expect(screen.getByLabelText(/current password/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
  });

  it('surfaces the error returned by onSubmit and keeps the dialog open', async () => {
    const onSubmit = vi.fn().mockResolvedValue('current_wrong');
    render(<ChangePasswordDialog provider="email" onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: /change password/i }));
    await waitFor(() => expect(screen.getByLabelText(/current password/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'wrongpass' } });
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'newpass123' } });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/not correct/i));
    // Still open, so the user can retry without re-opening.
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
  });

  it('closes on success', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null);
    render(<ChangePasswordDialog provider="email" onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: /change password/i }));
    await waitFor(() => expect(screen.getByLabelText(/current password/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'oldpass1' } });
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'newpass123' } });
    fireEvent.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument());
    expect(onSubmit).toHaveBeenCalledWith('oldpass1', 'newpass123', 'newpass123');
  });

  it('the submit button is disabled until all three fields are filled', async () => {
    render(<ChangePasswordDialog provider="email" onSubmit={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /change password/i }));
    await waitFor(() => expect(screen.getByLabelText(/current password/i)).toBeInTheDocument());

    expect(screen.getByRole('button', { name: /update password/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'oldpass1' } });
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'newpass123' } });

    expect(screen.getByRole('button', { name: /update password/i })).not.toBeDisabled();
  });
});
