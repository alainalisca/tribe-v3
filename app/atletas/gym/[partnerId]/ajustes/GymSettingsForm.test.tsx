/**
 * T-AV26: the settings form sends the WHOLE program on every save, starting
 * from what the server loaded, so changing one field never blanks another
 * (CLAUDE.md, "A PATCH whose payload is built from component state").
 *
 * Mutation proofs (run by hand, named test goes red):
 *   - toForm: initialise conversion_bonus_cop to '' -> "editing one field sends every other field unchanged"
 *   - drop the `if (!res.ok)` branch -> "a refused save says so and shows no success"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GYM_PARTNER_ID, gymSummary } from '@/lib/atletas/gymFixtures';
import { settingsFromProgram } from '@/lib/atletas/gymSettings';

const h = vi.hoisted(() => ({ fetch: vi.fn(), showSuccess: vi.fn() }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es' }) }));
vi.mock('@/components/BottomNav', () => ({ default: () => null }));
vi.mock('@/lib/toast', () => ({ showSuccess: h.showSuccess }));

import GymSettingsForm from './GymSettingsForm';

const initial = settingsFromProgram(gymSummary().program);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', h.fetch);
  h.fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
});

describe('GymSettingsForm', () => {
  it('shows every editable column, both languages for text, and nothing for is_active', () => {
    const { container } = render(<GymSettingsForm partnerId={GYM_PARTNER_ID} initial={initial} />);
    const names = [...container.querySelectorAll('[name]')].map((e) => e.getAttribute('name')).sort();
    expect(names).toEqual(Object.keys(initial).sort());
    expect(container.querySelector('[name="is_active"]')).toBeNull();
    expect(screen.getByText('Llegadas para subir de nivel')).toBeTruthy();
    expect(screen.getByText('Oferta de bienvenida')).toBeTruthy();
  });

  it('editing one field sends every other field unchanged, numbers as numbers', async () => {
    const { container } = render(<GymSettingsForm partnerId={GYM_PARTNER_ID} initial={initial} />);
    fireEvent.change(container.querySelector('[name="showup_reward_es"]') as HTMLElement, {
      target: { value: 'Dos clases gratis' },
    });
    fireEvent.submit(container.querySelector('[data-gym-settings]') as HTMLElement);
    await waitFor(() => expect(h.fetch).toHaveBeenCalled());
    const [url, init] = h.fetch.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe(`/api/atletas/gym/${GYM_PARTNER_ID}/settings/`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ ...initial, showup_reward_es: 'Dos clases gratis' });
    await waitFor(() =>
      expect(container.querySelector('[data-settings-status="saved"]')?.textContent).toBe('Ajustes guardados')
    );
    expect(h.showSuccess).toHaveBeenCalledWith('Ajustes guardados');
  });

  it('a refused save says so and shows no success', async () => {
    h.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'not_found' }) });
    const { container } = render(<GymSettingsForm partnerId={GYM_PARTNER_ID} initial={initial} />);
    fireEvent.submit(container.querySelector('[data-gym-settings]') as HTMLElement);
    await waitFor(() =>
      expect(container.querySelector('[data-settings-status="error"]')?.textContent).toBe(
        'No pudimos guardar eso. Intenta de nuevo.'
      )
    );
    expect(h.showSuccess).not.toHaveBeenCalled();
  });
});
