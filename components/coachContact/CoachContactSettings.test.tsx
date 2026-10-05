import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CoachContactSettings from './CoachContactSettings';

const fetchMyContactSettings = vi.fn();
const saveWhatsAppContact = vi.fn();
const saveCallLink = vi.fn();
const showError = vi.fn();

vi.mock('@/lib/features/useAthleteValueFeature', () => ({ useAthleteValueFeature: () => true }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/toast', () => ({ showError: (...a: unknown[]) => showError(...a), showSuccess: vi.fn() }));
vi.mock('@/lib/dal/coachContact', () => ({
  fetchMyContactSettings: (...a: unknown[]) => fetchMyContactSettings(...a),
  saveWhatsAppContact: (...a: unknown[]) => saveWhatsAppContact(...a),
  saveCallLink: (...a: unknown[]) => saveCallLink(...a),
}));

beforeEach(() => {
  vi.clearAllMocks();
  fetchMyContactSettings.mockResolvedValue({ success: true, data: null });
  saveWhatsAppContact.mockResolvedValue({ success: true });
  saveCallLink.mockResolvedValue({ success: true });
});

async function setup() {
  render(<CoachContactSettings coachId="coach-1" language="es" />);
  const box = await screen.findByRole('checkbox');
  const field = screen.getByLabelText('Tu número de WhatsApp');
  return {
    box,
    field,
    link: screen.getByLabelText(/Enlace para agendar/),
    save: screen.getByRole('button', { name: 'Guardar' }),
  };
}

describe('CoachContactSettings', () => {
  it('saves a Colombian number typed without the plus as E.164', async () => {
    const { box, field, save } = await setup();
    fireEvent.click(box);
    fireEvent.change(field, { target: { value: '300 111 2233' } });
    fireEvent.click(save);
    await waitFor(() => expect(saveWhatsAppContact).toHaveBeenCalledWith({}, true, '+573001112233'));
  });

  it('refuses a number it cannot read, and saves nothing', async () => {
    const { field, save } = await setup();
    fireEvent.change(field, { target: { value: '12345' } });
    fireEvent.click(save);
    await waitFor(() => expect(showError).toHaveBeenCalled());
    expect(saveWhatsAppContact).not.toHaveBeenCalled();
  });

  it('refuses to switch the button on without a number', async () => {
    const { box, save } = await setup();
    fireEvent.click(box);
    fireEvent.click(save);
    await waitFor(() => expect(showError).toHaveBeenCalledWith(expect.stringContaining('número')));
    expect(saveWhatsAppContact).not.toHaveBeenCalled();
  });

  it('loads the saved choice', async () => {
    fetchMyContactSettings.mockResolvedValue({
      success: true,
      data: { whatsapp_e164: '+573001112233', whatsapp_opt_in: true },
    });
    const { box, field } = await setup();
    expect((box as HTMLInputElement).checked).toBe(true);
    expect((field as HTMLInputElement).value).toBe('+573001112233');
  });

  it('saves a call link typed without https://, as https', async () => {
    const { link, save } = await setup();
    fireEvent.change(link, { target: { value: 'calendly.com/salomon' } });
    fireEvent.click(save);
    await waitFor(() => expect(saveCallLink).toHaveBeenCalledWith({}, 'https://calendly.com/salomon'));
  });

  it('refuses an http link, and saves nothing', async () => {
    const { link, save } = await setup();
    fireEvent.change(link, { target: { value: 'http://calendly.com/salomon' } });
    fireEvent.click(save);
    await waitFor(() => expect(showError).toHaveBeenCalledWith(expect.stringContaining('https://')));
    expect(saveCallLink).not.toHaveBeenCalled();
    expect(saveWhatsAppContact).not.toHaveBeenCalled();
  });

  it('an empty link field removes the link', async () => {
    const { save } = await setup();
    fireEvent.click(save);
    await waitFor(() => expect(saveCallLink).toHaveBeenCalledWith({}, null));
  });
});
