import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/** T-POLISH1 PR 3b-1: /g gets the gym's actions, its free-class pass and its coaches. */
vi.mock('@/lib/LanguageContext', async () => {
  const { translations } = await import('@/lib/translations');
  return {
    useLanguage: () => ({ language: 'es', t: (k: string) => (translations.es as Record<string, string>)[k] ?? k }),
  };
});
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const q: Record<string, unknown> = {};
    for (const m of ['from', 'select', 'eq', 'gte', 'lte', 'order', 'limit', 'in', 'not']) q[m] = () => q;
    q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
    return { ...q, auth: { getUser: async () => ({ data: { user: null } }) } };
  },
}));
vi.mock('@/components/TribeWordmark', () => ({ default: () => <span>Tribe</span> }));

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
