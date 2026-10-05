import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import CoachContactButtons from './CoachContactButtons';

let flagOn = true;
const fetchCoachContactOptions = vi.fn();
const logCoachContactTap = vi.fn();

vi.mock('@/lib/features/useAthleteValueFeature', () => ({ useAthleteValueFeature: () => flagOn }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/dal/coachContact', () => ({
  fetchCoachContactOptions: (...a: unknown[]) => fetchCoachContactOptions(...a),
  logCoachContactTap: (...a: unknown[]) => logCoachContactTap(...a),
}));

beforeEach(() => {
  vi.clearAllMocks();
  flagOn = true;
  fetchCoachContactOptions.mockResolvedValue({ success: true, data: { whatsapp: '+573001112233' } });
  logCoachContactTap.mockResolvedValue({ success: true });
});

const base = { coachId: 'coach-1', coachName: 'Salomón Restrepo', viewerId: 'athlete-1', language: 'es' as const };

describe('CoachContactButtons', () => {
  it('links to WhatsApp with the prefilled origin line', async () => {
    render(<CoachContactButtons {...base} source="storefront" />);
    const link = await screen.findByRole('link', { name: /Escríbele a Salomón por WhatsApp/ });
    const href = link.getAttribute('href') ?? '';
    expect(href.startsWith('https://wa.me/573001112233?text=')).toBe(true);
    expect(decodeURIComponent(href.split('?text=')[1])).toBe('Hola Salomón, te encontré en Tribe.');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('logs the tap with its source and session, on click', async () => {
    render(<CoachContactButtons {...base} source="session" sessionId="s-9" />);
    fireEvent.click(await screen.findByRole('link'));
    expect(logCoachContactTap).toHaveBeenCalledWith(
      {},
      { coachId: 'coach-1', channel: 'whatsapp', source: 'session', sessionId: 's-9' }
    );
  });

  it('renders nothing when the coach has no number or did not opt in', async () => {
    fetchCoachContactOptions.mockResolvedValue({ success: true, data: { whatsapp: null } });
    const { container } = render(<CoachContactButtons {...base} source="storefront" />);
    await waitFor(() => expect(fetchCoachContactOptions).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing, and asks nothing, with the flag off', async () => {
    flagOn = false;
    const { container } = render(<CoachContactButtons {...base} source="storefront" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe('');
    expect(fetchCoachContactOptions).not.toHaveBeenCalled();
  });

  it('never renders for the coach on their own page', async () => {
    const { container } = render(<CoachContactButtons {...base} viewerId="coach-1" source="storefront" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe('');
    expect(fetchCoachContactOptions).not.toHaveBeenCalled();
  });

  it('hides on re-render when the viewer becomes the coach, even with a number already loaded', async () => {
    const { rerender, container } = render(<CoachContactButtons {...base} source="storefront" />);
    await screen.findByRole('link');
    rerender(<CoachContactButtons {...base} viewerId="coach-1" source="storefront" />);
    expect(container.innerHTML).toBe('');
  });

  it('never renders for a signed-out viewer', async () => {
    const { container } = render(<CoachContactButtons {...base} viewerId={null} source="storefront" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe('');
  });

  it('shows "Agenda una llamada gratis" on the storefront and logs it as call_link', async () => {
    fetchCoachContactOptions.mockResolvedValue({
      success: true,
      data: { whatsapp: null, callLink: 'https://calendly.com/salomon' },
    });
    render(<CoachContactButtons {...base} source="storefront" />);
    const link = await screen.findByRole('link', { name: /Agenda una llamada gratis/ });
    expect(link.getAttribute('href')).toBe('https://calendly.com/salomon');
    expect(link.getAttribute('rel')).toContain('noopener');
    fireEvent.click(link);
    expect(logCoachContactTap).toHaveBeenCalledWith(
      {},
      { coachId: 'coach-1', channel: 'call_link', source: 'storefront' }
    );
  });

  it('never shows the call link on session detail', async () => {
    fetchCoachContactOptions.mockResolvedValue({
      success: true,
      data: { whatsapp: '+573001112233', callLink: 'https://calendly.com/salomon' },
    });
    render(<CoachContactButtons {...base} source="session" sessionId="s-1" />);
    await screen.findByRole('link', { name: /WhatsApp/ });
    expect(screen.queryByRole('link', { name: /llamada/ })).toBeNull();
  });
});
