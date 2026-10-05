import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WelcomeNoteSettings from './WelcomeNoteSettings';

let flagOn = true;
const fetchMyWelcomeNote = vi.fn();
const saveWelcomeNote = vi.fn();
vi.mock('@/lib/features/useAthleteValueFeature', () => ({ useAthleteValueFeature: () => flagOn }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('@/lib/dal/coachWelcome', () => ({
  WELCOME_NOTE_MAX: 500,
  fetchMyWelcomeNote: (...a: unknown[]) => fetchMyWelcomeNote(...a),
  saveWelcomeNote: (...a: unknown[]) => saveWelcomeNote(...a),
}));

beforeEach(() => {
  vi.clearAllMocks();
  flagOn = true;
  fetchMyWelcomeNote.mockResolvedValue({ success: true, data: '' });
  saveWelcomeNote.mockResolvedValue({ success: true });
});

describe('WelcomeNoteSettings', () => {
  it('saves the note trimmed, and an emptied box as null', async () => {
    render(<WelcomeNoteSettings coachId="c1" language="es" />);
    const box = await screen.findByLabelText('Mensaje de bienvenida');
    fireEvent.change(box, { target: { value: '  ¡Bienvenido!  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(saveWelcomeNote).toHaveBeenCalledWith({}, '¡Bienvenido!'));
    fireEvent.change(box, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(saveWelcomeNote).toHaveBeenLastCalledWith({}, null));
  });

  it('renders nothing, and reads nothing, with the flag off', async () => {
    flagOn = false;
    const { container } = render(<WelcomeNoteSettings coachId="c1" language="es" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe('');
    expect(fetchMyWelcomeNote).not.toHaveBeenCalled();
  });
});
