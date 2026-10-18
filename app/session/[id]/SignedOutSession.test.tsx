import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Toaster } from 'react-hot-toast';

/**
 * T-JOIN1 Part B: the session page signed out. Real copy (messages/es.json),
 * the guest join mocked at its helper: nothing here reaches a database.
 */

vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es' }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn(() => ({})) }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
const insertGuestParticipant = vi.fn();
const removeGuestParticipant = vi.fn();
vi.mock('@/hooks/sessionActionHelpers', () => ({
  insertGuestParticipant: (...a: unknown[]) => insertGuestParticipant(...a),
  removeGuestParticipant: (...a: unknown[]) => removeGuestParticipant(...a),
  storeGuestLocally: (id: string, _info: unknown, token: string) => localStorage.setItem(`guest_token_${id}`, token),
  notifyHostOfGuestJoin: vi.fn(),
}));

import SignedOutSession, { type PublicSession } from './SignedOutSession';

// react-hot-toast's Toaster reads prefers-reduced-motion; jsdom has no matchMedia.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  onchange: null,
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const STREET = 'Cra 43A #1-50';
const base: PublicSession = {
  id: 'f8230509-9aa3-4a79-98e4-afa7b6e695ef',
  title: null,
  sport: 'Boxing',
  date: '2030-10-19',
  start_time: '18:30:00',
  duration: 60,
  description: 'Guantes y vendas. Llega 10 minutos antes.',
  photos: [],
  max_participants: 10,
  current_participants: 3,
  status: 'active',
  is_paid: false,
  price_cents: 0,
  currency: 'COP',
  creator_id: 'c1',
  location: `${STREET}, El Poblado, Medellín`,
  location_lat: 6.2086,
  location_lng: -75.5659,
  partner_status: null,
};
const creator = { id: 'c1', name: 'Salomon Tabares', avatar_url: null };

function renderPage(over: Partial<PublicSession> = {}, gymName: string | null = null) {
  return render(
    <>
      <SignedOutSession
        session={{ ...base, ...over }}
        creator={creator}
        gymName={gymName}
        language="es"
        isPast={false}
        isFull={false}
      />
      <Toaster />
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('SignedOutSession', () => {
  it('a free session: title fallback, the four facts, one lime "Pedir mi cupo"', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Boxeo con Salomon');
    for (const label of ['Cuándo', 'Dónde', 'Cuánto', 'Quién'])
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(screen.getByText('Directo a Salomon. Tribe no cobra comisión.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pedir mi cupo' })).toBeInTheDocument();
    expect(screen.queryByText('Entrar para pedir cupo')).not.toBeInTheDocument();
  });

  it('a paid session: the price, and "Entrar para pedir cupo" to sign-in and back; no guest button', () => {
    renderPage({ is_paid: true, price_cents: 4000000 });
    const link = screen.getByRole('link', { name: 'Entrar para pedir cupo' });
    expect(link).toHaveAttribute('href', `/auth/?returnTo=${encodeURIComponent(`/session/${base.id}/`)}`);
    expect(screen.queryByRole('button', { name: 'Pedir mi cupo' })).not.toBeInTheDocument();
    expect(screen.getAllByText(/40\.000 COP/).length).toBeGreaterThan(0);
  });

  it('never shows the street address: the barrio, or the partner gym', () => {
    const { container, unmount } = renderPage();
    expect(container.textContent).not.toContain(STREET);
    expect(container.textContent).toContain('El Poblado');
    unmount();
    const withGym = renderPage({ partner_status: 'approved' }, 'BullBox');
    expect(withGym.container.textContent).not.toContain(STREET);
    expect(withGym.container.textContent).toContain('BullBox');
  });

  it('the guest modal asks for name and WhatsApp only, and refuses a bad phone before sending', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Pedir mi cupo' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText(/correo|email/i)).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole('textbox')).toHaveLength(2);
    fireEvent.change(within(dialog).getByLabelText('Tu nombre'), { target: { value: 'Ana' } });
    fireEvent.change(within(dialog).getByLabelText(/WhatsApp/), { target: { value: '604 444 5555' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(insertGuestParticipant).not.toHaveBeenCalled();
  });

  it('success: the button turns "Pedido ✓", the initials join the stack, the toast offers "Deshacer"', async () => {
    insertGuestParticipant.mockResolvedValue({ id: 'p1', guest_token: 'tok-1' });
    removeGuestParticipant.mockResolvedValue(true);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Pedir mi cupo' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Tu nombre'), { target: { value: 'Ana Gómez' } });
    fireEvent.change(within(dialog).getByLabelText(/WhatsApp/), { target: { value: '300 123 4567' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    });

    expect(insertGuestParticipant).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: base.id }),
      expect.objectContaining({ name: 'Ana Gómez', phone: '300 123 4567' })
    );
    expect(await screen.findByText('Pedido ✓')).toBeInTheDocument();
    expect(screen.getByText('AG')).toBeInTheDocument();
    expect(screen.getByText('Van 4')).toBeInTheDocument();
    expect(await screen.findByText('Cupo pedido. Salomon te confirma por WhatsApp.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    await waitFor(() => expect(removeGuestParticipant).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Pedir mi cupo' })).toBeInTheDocument();
  });

  it('a refusal from the server is worded in the modal', async () => {
    insertGuestParticipant.mockRejectedValue(new Error('already_joined'));
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Pedir mi cupo' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Tu nombre'), { target: { value: 'Ana' } });
    fireEvent.change(within(dialog).getByLabelText(/WhatsApp/), { target: { value: '3001234567' } });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
    });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/ya/i);
  });

  it('a full session offers an inert label, no button', () => {
    render(<SignedOutSession session={base} creator={creator} gymName={null} language="es" isPast={false} isFull />);
    expect(screen.queryByRole('button', { name: 'Pedir mi cupo' })).not.toBeInTheDocument();
  });

  it('a cancelled session (T-JOIN1b): the notice, a link to the coach page, nothing to book', () => {
    renderPage({ status: 'cancelled' });
    expect(screen.getByText('Esta sesión fue cancelada')).toBeInTheDocument();
    // next/link drops the slash in tests; trailingSlash adds it back in the app.
    expect(screen.getByRole('link', { name: 'Ver el perfil de Salomon' }).getAttribute('href')).toMatch(/^\/i\/c1\/?$/);
    expect(screen.queryByRole('button', { name: 'Pedir mi cupo' })).not.toBeInTheDocument();
    expect(screen.queryByText('Entrar para pedir cupo')).not.toBeInTheDocument();
  });

  it('a cancelled paid session offers no sign-in either', () => {
    renderPage({ status: 'cancelled', is_paid: true, price_cents: 4000000 });
    expect(screen.queryByText('Entrar para pedir cupo')).not.toBeInTheDocument();
    expect(screen.getByText('Esta sesión fue cancelada')).toBeInTheDocument();
  });
});
