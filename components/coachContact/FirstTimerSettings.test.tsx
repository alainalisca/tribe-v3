import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FirstTimerSettings from './FirstTimerSettings';

const fetchMyFirstTimerText = vi.fn();
const saveFirstTimerText = vi.fn();
vi.mock('@/lib/features/useAthleteValueFeature', () => ({ useAthleteValueFeature: () => true }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('@/lib/dal/firstTimer', () => ({
  FIRST_TIMER_MAX: 600,
  fetchMyFirstTimerText: (...a: unknown[]) => fetchMyFirstTimerText(...a),
  saveFirstTimerText: (...a: unknown[]) => saveFirstTimerText(...a),
}));

beforeEach(() => {
  vi.clearAllMocks();
  fetchMyFirstTimerText.mockResolvedValue({ success: true, data: 'Trae agua.' });
  saveFirstTimerText.mockResolvedValue({ success: true });
});

describe('FirstTimerSettings', () => {
  it('loads the saved text and saves it trimmed', async () => {
    render(<FirstTimerSettings coachId="c1" language="es" />);
    const box = (await screen.findByLabelText('Para quien viene por primera vez')) as HTMLTextAreaElement;
    expect(box.value).toBe('Trae agua.');
    fireEvent.change(box, { target: { value: '  Llega temprano.  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(saveFirstTimerText).toHaveBeenCalledWith({}, 'Llega temprano.'));
  });

  it('an emptied box clears the text (null), which hides the block', async () => {
    render(<FirstTimerSettings coachId="c1" language="es" />);
    const box = await screen.findByLabelText('Para quien viene por primera vez');
    fireEvent.change(box, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(saveFirstTimerText).toHaveBeenCalledWith({}, null));
  });
});
