import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

/** T-POLISH1 PR 3b-1: /g gets the gym's actions, its free-class pass and its coaches. */
vi.mock('@/lib/LanguageContext', async () => {
  const { translations } = await import('@/lib/translations');
  return {
    useLanguage: () => ({ language: 'es', t: (k: string) => (translations.es as Record<string, string>)[k] ?? k }),
  };
});
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
// One client for the whole file, like @supabase/ssr's browser singleton: the
// page's sessions effect depends on it, so a new object per call would loop.
const client = vi.hoisted(() => {
  const q: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'eq', 'gte', 'lte', 'order', 'limit', 'in', 'not']) q[m] = () => q;
  q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  return q;
});
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => Object.assign(client, { auth: { getUser: async () => ({ data: { user: auth.user } }) } }),
}));
vi.mock('@/components/TribeWordmark', () => ({ default: () => <span>Tribe</span> }));
vi.mock('@/components/BottomNav', () => ({ default: () => <nav data-testid="bottom-nav" /> }));

import GymShareClient from './GymShareClient';
import type { PublicPartner } from '@/lib/partnerPublic';

const partner = {
  id: 'aaaaaaaa-0000-4000-8000-00000000000a',
  slug: 'bullbox',
  business_name: 'BullBox CrossFit',
  business_type: 'gym',
  description: null,
  description_es: null,
  logo_url: null,
  logo_image_url: null,
  website_url: null,
  phone: null,
  address: 'Laureles',
  lat: null,
  lng: null,
  specialties: null,
  display_order: null,
  // The banner column is left unset: lib/coverImage.singleColumn.test.ts keeps its name out of new files.
} as unknown as PublicPartner;

describe('/g with its extras', () => {
  it('the pass as the plain /pase link, the coaches linking to their /i pages, the actions without Interesado', async () => {
    render(
      <GymShareClient
        partner={partner}
        extras={{
          ownerId: 'owner-1',
          pass: { slug: 'bullbox', partnerName: 'BullBox CrossFit' },
          roster: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Salomon', avatarUrl: null }],
        }}
      />
    );
    const pass = screen.getByRole('link', { name: /Primera clase gratis/ });
    expect(pass.getAttribute('href')).toMatch(/^\/pase\/bullbox\/?$/);
    expect(screen.getByText('Deja tu WhatsApp y BullBox CrossFit te escribe')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Salomon/ }).getAttribute('href')).toMatch(
      /^\/i\/11111111-1111-4111-8111-111111111111\/?$/
    );
    await waitFor(() => expect(screen.getByTestId('public-profile-actions').dataset.viewer).toBe('out'));
    expect(screen.getByRole('link', { name: /Enviar mensaje/ }).getAttribute('href')).toContain('returnTo=');
    expect(screen.queryByText('Estoy interesado')).toBeNull();
  });

  it('no pass, no roster and no actions without them', () => {
    render(<GymShareClient partner={partner} extras={{ ownerId: null, pass: null, roster: [] }} />);
    expect(screen.queryByTestId('public-pass')).toBeNull();
    expect(screen.queryByTestId('gym-roster')).toBeNull();
    expect(screen.queryByTestId('public-profile-actions')).toBeNull();
  });
});

describe('/g signed in vs signed out (T-POLISH1 PR 3b-2, Al)', () => {
  beforeEach(() => {
    auth.user = null;
  });
  const noExtras = { ownerId: null, pass: null, roster: [] };

  it('signed out keeps "Únete a Tribe para reservar", to sign-in', async () => {
    render(<GymShareClient partner={partner} extras={noExtras} />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Únete a Tribe para reservar' })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Únete a Tribe para reservar' }).getAttribute('href')).toMatch(
      /^\/auth\/?$/
    );
    expect(screen.queryByRole('button', { name: 'Ver próximas clases' })).toBeNull();
    expect(screen.queryByTestId('bottom-nav')).toBeNull();
  });

  it('signed in: "Ver próximas clases" scrolls to the upcoming sessions, and the tab bar is there', async () => {
    auth.user = { id: 'viewer-1' };
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    render(<GymShareClient partner={partner} extras={noExtras} />);
    const button = await screen.findByRole('button', { name: 'Ver próximas clases' });
    expect(screen.queryByRole('link', { name: 'Únete a Tribe para reservar' })).toBeNull();
    expect(document.getElementById('proximas-sesiones')).not.toBeNull();
    fireEvent.click(button);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(document.getElementById('proximas-sesiones'));
    expect(screen.getByTestId('bottom-nav')).toBeInTheDocument();
  });

  it('with no upcoming sessions it still lands on the sessions card, which says there are none', async () => {
    auth.user = { id: 'viewer-1' };
    render(<GymShareClient partner={partner} extras={noExtras} />);
    await screen.findByRole('button', { name: 'Ver próximas clases' });
    const card = document.getElementById('proximas-sesiones') as HTMLElement;
    await waitFor(() => expect(card.textContent).toContain('No hay sesiones programadas'));
  });

  it('the server HTML is identical signed in and signed out (the signed-out button, no bar)', () => {
    auth.user = null;
    const out = renderToString(<GymShareClient partner={partner} extras={noExtras} />);
    auth.user = { id: 'viewer-1' };
    const inn = renderToString(<GymShareClient partner={partner} extras={noExtras} />);
    expect(inn).toBe(out);
    expect(inn).toContain('Únete a Tribe para reservar');
    expect(inn).not.toContain('Ver próximas clases');
  });
});
