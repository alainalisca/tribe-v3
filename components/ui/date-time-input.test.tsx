import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { extEs } from '@/lib/translationExtras';

/**
 * DateTimeInput: a native date/time field with a fixed height and an
 * "Elige fecha" / "Elige hora" hint while empty, because iPhone Safari ignores
 * `placeholder` on these inputs.
 */

vi.mock('@/lib/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: 'chooseDate' | 'chooseTime') => extEs[key] }),
}));

import { DateTimeInput } from './date-time-input';

function field(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input') as HTMLInputElement;
}

describe('DateTimeInput', () => {
  it('an empty date field shows "Elige fecha" and hides the native empty text', () => {
    const { container } = render(<DateTimeInput type="date" value="" onChange={() => {}} />);
    expect(screen.getByTestId('date-time-hint').textContent).toBe('Elige fecha');
    expect(field(container).className).toContain('text-transparent');
  });

  it('an empty time field shows "Elige hora"', () => {
    render(<DateTimeInput type="time" value="" onChange={() => {}} />);
    expect(screen.getByTestId('date-time-hint').textContent).toBe('Elige hora');
  });

  it('a filled field shows its value and no hint', () => {
    const { container } = render(<DateTimeInput type="date" value="2026-10-25" onChange={() => {}} />);
    expect(screen.queryByTestId('date-time-hint')).toBeNull();
    expect(field(container).value).toBe('2026-10-25');
    expect(field(container).className).not.toContain('text-transparent');
  });

  it('focus hides the hint so typed segments show; blur while still empty brings it back', () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    const { container } = render(
      <DateTimeInput type="date" value="" onChange={() => {}} onFocus={onFocus} onBlur={onBlur} />
    );
    fireEvent.focus(field(container));
    expect(screen.queryByTestId('date-time-hint')).toBeNull();
    expect(field(container).className).not.toContain('text-transparent');
    expect(onFocus).toHaveBeenCalledTimes(1);
    fireEvent.blur(field(container));
    expect(screen.getByTestId('date-time-hint')).toBeTruthy();
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('stays a native input of the given type, with an even 48 px box and 16 px text', () => {
    const { container } = render(
      <DateTimeInput type="time" value="" onChange={() => {}} className="h-auto py-3 bg-theme-card" required />
    );
    const input = field(container);
    expect(input.type).toBe('time');
    expect(input.required).toBe(true);
    expect(input.className).toContain('tribe-date-input');
    expect(input.className).toContain('h-12');
    expect(input.className).toContain('block');
    expect(input.className.split(' ')).not.toContain('flex');
    expect(input.className).toContain('text-base');
    expect(input.className).toContain('bg-theme-card');
    expect(input.className).not.toContain('h-auto');
    expect(input.className).not.toContain('py-3');
  });

  it('passes changes through', () => {
    const onChange = vi.fn();
    const { container } = render(<DateTimeInput type="date" value="" onChange={onChange} />);
    fireEvent.change(field(container), { target: { value: '2026-11-01' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
