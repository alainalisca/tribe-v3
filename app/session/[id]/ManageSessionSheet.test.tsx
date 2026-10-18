import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es', t: (k: string) => k }) }));
const seriesDialog = vi.hoisted(() => ({ open: false }));
vi.mock('@/components/session/CancelSeriesDialog', () => ({
  default: ({ open }: { open: boolean }) => {
    seriesDialog.open = open;
    return open ? <div>series dialog</div> : null;
  },
}));

import ManageSessionSheet from './ManageSessionSheet';

/** T-UI-SD1: the host's "Gestionar" sheet. */
function sheet(over: Partial<React.ComponentProps<typeof ManageSessionSheet>> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    sessionId: 's1',
    language: 'es' as const,
    isTest: false,
    isPast: false,
    isSeriesMember: false,
    isSeriesParent: false,
    creatingInvite: false,
    onEdit: vi.fn(),
    onInvite: vi.fn(),
    onCancel: vi.fn(),
    onCancelOccurrence: vi.fn(),
    onEndSeries: vi.fn(),
    ...over,
  };
  render(
    <ManageSessionSheet {...props}>{over.children ?? <div>Asistencia de clientes Tribe.OS</div>}</ManageSessionSheet>
  );
  return props;
}

describe('ManageSessionSheet', () => {
  it('upcoming: status, Editar, Invitar, Chat, Tribe.OS, and Cancelar sesión last', () => {
    sheet();
    const text = screen.getByTestId('manage-session-sheet').textContent ?? '';
    const order = [
      'Sesión pública',
      'Editar sesión',
      'Invitar amigo',
      'Chat grupal',
      'Asistencia de clientes Tribe.OS',
      'Cancelar sesión',
    ];
    const positions = order.map((s) => text.indexOf(s));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(screen.getByRole('link', { name: /Chat grupal/ })).toHaveAttribute('href', '/session/s1/chat');
  });

  it('a test session says so', () => {
    sheet({ isTest: true });
    expect(screen.getByText(/Sesión de prueba: solo tú y los admins la ven/)).toBeInTheDocument();
  });

  it('Editar and Invitar close the sheet first', () => {
    const p = sheet();
    fireEvent.click(screen.getByRole('button', { name: /Editar sesión/ }));
    fireEvent.click(screen.getByRole('button', { name: /Invitar amigo/ }));
    expect(p.onClose).toHaveBeenCalledTimes(2);
    expect(p.onEdit).toHaveBeenCalledTimes(1);
    expect(p.onInvite).toHaveBeenCalledTimes(1);
  });

  it('cancelling a one-off goes to the page confirm; a series asks which dates', () => {
    const one = sheet();
    fireEvent.click(screen.getByRole('button', { name: /Cancelar sesión/ }));
    expect(one.onCancel).toHaveBeenCalledTimes(1);
  });

  it('a series member opens the series dialog instead', () => {
    const series = sheet({ isSeriesMember: true });
    fireEvent.click(screen.getByRole('button', { name: /Cancelar sesión/ }));
    expect(series.onCancel).not.toHaveBeenCalled();
    expect(screen.getByText('series dialog')).toBeInTheDocument();
  });

  it('after the session: no edit, invite, chat or cancel; Tribe.OS stays', () => {
    sheet({ isPast: true });
    for (const label of ['Editar sesión', 'Invitar amigo', 'Chat grupal', 'Cancelar sesión'])
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    expect(screen.getByText('Asistencia de clientes Tribe.OS')).toBeInTheDocument();
  });
});
