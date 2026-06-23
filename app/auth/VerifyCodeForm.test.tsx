import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VerifyCodeForm from './VerifyCodeForm';
import { getAuthTranslations } from './translations';

const t = getAuthTranslations('en');

function setup(over = {}) {
  const props = {
    t,
    email: 'ana@example.com',
    code: '',
    loading: false,
    message: '',
    resendCooldown: 0,
    onCodeChange: vi.fn(),
    onSubmit: vi.fn((e) => e.preventDefault()),
    onResend: vi.fn(),
    onBack: vi.fn(),
    ...over,
  };
  render(<VerifyCodeForm {...props} />);
  return props;
}

describe('VerifyCodeForm', () => {
  it('shows the destination email and a code input', () => {
    setup();
    expect(screen.getByText(/ana@example.com/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('123456')).toBeInTheDocument();
  });

  it('fires onCodeChange with digits only', () => {
    const props = setup();
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '12a3' } });
    expect(props.onCodeChange).toHaveBeenCalledWith('123');
  });

  it('disables resend while cooling down', () => {
    setup({ resendCooldown: 42 });
    expect(screen.getByText(/42s/)).toBeInTheDocument();
  });
});
