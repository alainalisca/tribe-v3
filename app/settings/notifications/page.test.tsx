import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

/** T-JOIN1 Part C: a failed read no longer leaves "Cargando…" on screen forever. */
// One router object, as Next gives: a new one per render would re-run the page's effect.
const router = { replace: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es' }) }));
vi.mock('@/components/BottomNav', () => ({ default: () => null }));
vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock('@/lib/haptics', () => ({ haptic: vi.fn() }));
const client = { auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } };
vi.mock('@/lib/supabase/client', () => ({ createClient: () => client }));
const getNotificationPreferences = vi.fn();
vi.mock('@/lib/dal/notificationPreferences', () => ({
  getNotificationPreferences: (...a: unknown[]) => getNotificationPreferences(...a),
  updateNotificationPreferences: vi.fn(),
}));

import NotificationPreferencesPage from './page';

describe('notification preferences', () => {
  it('says the read failed and retries instead of spinning', async () => {
    getNotificationPreferences.mockResolvedValue({ success: true, data: { user_id: 'u1' } });
    getNotificationPreferences.mockResolvedValueOnce({ success: false, error: 'boom' });
    render(<NotificationPreferencesPage />);
    expect(await screen.findByText('No se pudieron cargar tus preferencias.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await vi.waitFor(() => expect(getNotificationPreferences).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: 'Guardar' })).toBeInTheDocument();
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument();
  });
});
