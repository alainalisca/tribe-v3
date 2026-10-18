import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const fetchCoachLink = vi.fn();
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/dal/coachLink', () => ({ fetchCoachLink: (...a: unknown[]) => fetchCoachLink(...a) }));
vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
// The block's words follow the app language (useTranslations reads LanguageContext).
let appLanguage: 'es' | 'en' = 'es';
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: appLanguage }) }));

import CoachLinkBlock from './CoachLinkBlock';

/** T-SHARE1 Part C: "Tu link" shows the link, and WhatsApp opens with the message and the link, encoded. */
describe('Tu link', () => {
  it('shows the handle link and a WhatsApp share carrying it', async () => {
    fetchCoachLink.mockResolvedValue({ success: true, data: { id: 'u1', handle: 'andres' } });
    appLanguage = 'es';
    render(<CoachLinkBlock userId="u1" language="es" />);
    expect(await screen.findByText('tribelatam.com/i/andres')).toBeTruthy();
    const wa = screen.getByRole('link', { name: 'Compartir por WhatsApp' });
    const href = wa.getAttribute('href') ?? '';
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(href.split('text=')[1])).toMatch(
      /^Esta es mi página en Tribe\..*https:\/\/tribelatam\.com\/i\/andres$/
    );
    expect(screen.getByText('Cuando alguien llega por tu link, lo verás aquí.')).toBeTruthy();
    expect(screen.queryByText(/\d+ (personas|visitas)/)).toBeNull();
  });

  it('with no handle yet: the id link, and where to choose one', async () => {
    fetchCoachLink.mockResolvedValue({ success: true, data: { id: 'u1', handle: null } });
    appLanguage = 'en';
    render(<CoachLinkBlock userId="u1" language="en" />);
    expect(await screen.findByText('tribelatam.com/i/u1')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Choose your link in Edit profile' }).getAttribute('href')).toMatch(
      /^\/profile\/edit\/?#tu-link$/
    );
  });
});
