import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

/** T-JOIN1b: the "Sesión de prueba" switch, off by default, in Spanish and English. */
const lang = vi.hoisted(() => ({ value: 'es' as 'es' | 'en' }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: lang.value }) }));

import TestSessionToggle from './TestSessionToggle';

describe('TestSessionToggle', () => {
  it('shows its state and flips it', () => {
    const onChange = vi.fn();
    const { rerender } = render(<TestSessionToggle value={false} onChange={onChange} />);
    const sw = screen.getByRole('switch', { name: 'Sesión de prueba' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(<TestSessionToggle value onChange={onChange} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('speaks English too', () => {
    lang.value = 'en';
    render(<TestSessionToggle value={false} onChange={() => {}} />);
    expect(screen.getByRole('switch', { name: 'Test session' })).toBeInTheDocument();
    lang.value = 'es';
  });
});
