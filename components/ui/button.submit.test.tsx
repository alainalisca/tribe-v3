/**
 * The shared Button defaults to type="button" (T-GYM2, 2026-09-11).
 *
 * HTML defaults a typeless <button> inside a <form> to type="submit", so every
 * unlabelled control became a submit control the moment it was composed into a
 * form. That shipped: a day-of-week toggle published the session on the first
 * click. Inverting the default removes the class instead of policing it -- a
 * forgotten type now fails loudly (the form does not submit) rather than
 * silently submitting early.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './button';

function inForm(ui: React.ReactNode, onSubmit: () => void) {
  return render(
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {ui}
    </form>
  );
}

describe('Button type default', () => {
  it('does NOT submit the form when no type is given', () => {
    const onSubmit = vi.fn();
    inForm(<Button>Toggle</Button>, onSubmit);
    fireEvent.click(screen.getByText('Toggle'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders type="button" on the element', () => {
    const { container } = render(<Button>Toggle</Button>);
    expect(container.querySelector('button')?.getAttribute('type')).toBe('button');
  });

  it('DOES submit when type="submit" is passed explicitly', () => {
    // The other half. Without this the default could break every form and the
    // first test would still pass.
    const onSubmit = vi.fn();
    inForm(<Button type="submit">Create</Button>, onSubmit);
    fireEvent.click(screen.getByText('Create'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('forwards an explicit type="reset" rather than overriding it', () => {
    const { container } = render(<Button type="reset">Clear</Button>);
    expect(container.querySelector('button')?.getAttribute('type')).toBe('reset');
  });

  it('does not put a type on an asChild element, where it is invalid HTML', () => {
    // asChild renders the child -- frequently a link. <a type="button"> is not
    // valid, and Slot would merge it straight through.
    const { container } = render(
      <Button asChild>
        <a href="/somewhere">Go</a>
      </Button>
    );
    const anchor = container.querySelector('a');
    expect(anchor).toBeTruthy();
    expect(anchor?.hasAttribute('type')).toBe(false);
  });
});
