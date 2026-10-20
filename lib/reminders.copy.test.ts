import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/dal', () => ({ fetchParticipationsWithSession: vi.fn() }));

import { sessionReminderCopy } from './reminders';

/** The local one-hour reminder, in the language of the person on this device. */
describe('sessionReminderCopy', () => {
  it('Spanish, with the sport in Spanish', () => {
    expect(sessionReminderCopy({ sport: 'Running', location: 'Parque Lleras' }, 'es')).toEqual({
      title: '⏰ Recordatorio de sesión',
      body: 'Tu sesión de Correr en Parque Lleras empieza en 1 hora.',
    });
  });

  it('English', () => {
    expect(sessionReminderCopy({ sport: 'Running', location: 'Parque Lleras' }, 'en')).toEqual({
      title: '⏰ Session reminder',
      body: 'Your Running session at Parque Lleras starts in 1 hour.',
    });
  });
});
