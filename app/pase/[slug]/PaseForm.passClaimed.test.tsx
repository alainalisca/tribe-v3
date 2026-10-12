/**
 * T-ANALYTICS1 part D: pass_claimed fires when the SERVER accepts the lead,
 * never on tap, and carries the partner and campaign tags only, nothing the
 * person typed (name, WhatsApp, email stay out of PostHog).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('server-only', () => ({}));
const trackEvent = vi.fn();
vi.mock('@/lib/analytics', () => ({ trackEvent: (...a: unknown[]) => trackEvent(...a) }));

import PaseForm from './PaseForm';

const props = {
  slug: 'bullbox',
  partnerName: 'BullBox',
  options: {},
  consentText: 'Acepto',
  consentPolicyPath: '/legal/tratamiento-de-datos/',
};

function fillAndSubmit() {
  render(<PaseForm {...props} />);
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Laura Gómez' } });
  fireEvent.change(screen.getByLabelText('WhatsApp'), { target: { value: '+57 300 123 4567' } });
  fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'laura@example.com' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.submit(screen.getByRole('button', { name: /./, hidden: false }).closest('form')!);
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  trackEvent.mockClear();
});

afterEach(() => vi.unstubAllGlobals());

describe('pass_claimed', () => {
  it('fires once the server accepts the claim, with partner and campaign tags only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ pass_code: 'BU-G7KX', whatsapp_url: null, storefront_url: null }),
      })
    );
    fillAndSubmit();
    await waitFor(() => expect(trackEvent).toHaveBeenCalledWith('pass_claimed', expect.anything()));
    const [, props] = trackEvent.mock.calls.find((c) => c[0] === 'pass_claimed')!;
    expect(props).toEqual({ partner_slug: 'bullbox', src: null, code: null });
    expect(JSON.stringify(props)).not.toMatch(/laura|example\.com|300 ?123/i);
  });

  it('does not fire when the server refuses it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'nope' }) })
    );
    fillAndSubmit();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(trackEvent).not.toHaveBeenCalledWith('pass_claimed', expect.anything());
  });
});
