import { describe, it, expect } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { anyDialogOpen, useAnyDialogOpen } from './useAnyDialogOpen';

/** T-UI-SD1: floating chrome hides while a bottom sheet or dialog is open. */
function Probe() {
  return <span data-testid="probe">{useAnyDialogOpen() ? 'open' : 'closed'}</span>;
}

describe('useAnyDialogOpen', () => {
  it('follows Radix dialogs opening and closing', async () => {
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('closed');
    const sheet = document.createElement('div');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('data-state', 'open');
    await act(async () => {
      document.body.appendChild(sheet);
    });
    expect(screen.getByTestId('probe').textContent).toBe('open');
    await act(async () => {
      sheet.setAttribute('data-state', 'closed');
    });
    expect(screen.getByTestId('probe').textContent).toBe('closed');
    sheet.remove();
  });

  it('ignores closed dialogs and other elements', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div role="dialog" data-state="closed"></div><div data-state="open"></div>';
    expect(anyDialogOpen(root)).toBe(false);
    root.innerHTML += '<div role="alertdialog" data-state="open"></div>';
    expect(anyDialogOpen(root)).toBe(true);
  });
});
