/**
 * A typeless <button> inside a <form> is type="submit" (T-GYM2 P0, 2026-09-11).
 *
 * All three controls here rendered without a type attribute, inside
 * <form onSubmit={handleSubmit}> on BOTH the create and the edit page. Clicking
 * a single day-of-week toggle therefore submitted the form and published the
 * session immediately: the instructor never reached the remaining days, and the
 * venue request arrived in the gym's queue twice.
 *
 * These render inside a real <form> on purpose. Testing the component in
 * isolation cannot see this bug at all -- the submit behaviour only exists in
 * the context the component is actually used in, which is exactly why it
 * reached production.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RecurringSessionToggle from './RecurringSessionToggle';

vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }));

function renderInForm(onSubmit: () => void) {
  const value = { is_recurring: true, recurrence_pattern: 'weekly', recurrence_end_date: '' };
  return render(
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <RecurringSessionToggle value={value} onChange={() => {}} />
      <button type="submit">Create</button>
    </form>
  );
}

describe('RecurringSessionToggle inside a form', () => {
  it('clicking a day-of-week toggle does NOT submit the form', () => {
    const onSubmit = vi.fn();
    const { container } = renderInForm(onSubmit);

    // The day grid: short weekday labels rendered as buttons.
    const dayButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
      /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat|S|M|T|W|F)$/i.test(b.textContent?.trim() ?? '')
    );
    expect(dayButtons.length).toBeGreaterThan(0);

    fireEvent.click(dayButtons[0]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('clicking a frequency option does NOT submit the form', () => {
    const onSubmit = vi.fn();
    renderInForm(onSubmit);
    fireEvent.click(screen.getByText(/^weekly$/i));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('every button in the component declares an explicit type', () => {
    // The general rule, so a newly added control cannot reintroduce this.
    const { container } = renderInForm(vi.fn());
    const ours = Array.from(container.querySelectorAll('button')).filter((b) => b.textContent !== 'Create');
    expect(ours.length).toBeGreaterThan(0);
    for (const button of ours) {
      expect(button.getAttribute('type')).toBe('button');
    }
  });

  it('the real submit button still submits', () => {
    // Guards the over-correction: typing everything "button" would break the form.
    const onSubmit = vi.fn();
    renderInForm(onSubmit);
    fireEvent.click(screen.getByText('Create'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
