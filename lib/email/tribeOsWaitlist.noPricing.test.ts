import { describe, it, expect, vi, beforeEach } from 'vitest';

const send = vi.fn();
vi.mock('@/lib/email/resendClient', () => ({ getResendClient: () => ({ emails: { send } }) }));

import { sendTribeOsWaitlistAdminNotification, sendTribeOsWaitlistConfirmation } from './tribeOsWaitlist';

/**
 * T-SITE1 Part E: the /tribe-os/ page shows no prices, so its waitlist form
 * sends no pricing preference. The emails then leave the pricing sentence out
 * rather than print "null".
 */
const base = {
  name: 'Ana',
  email: 'ana@example.com',
  whatTheyTeach: 'Yoga',
  sessionsPerWeek: 4,
  language: 'es' as const,
};

describe('Tribe.OS waitlist emails without a pricing preference', () => {
  beforeEach(() => send.mockReset().mockResolvedValue({ error: null }));

  it('confirmation: no pricing sentence, in text or HTML', async () => {
    await sendTribeOsWaitlistConfirmation({ ...base, pricingPreference: null });
    const { text, html } = send.mock.calls[0][0] as { text: string; html: string };
    for (const body of [text, html]) {
      expect(body).toContain('4 sesiones por semana.');
      expect(body).not.toMatch(/preferencia de precios|null/);
    }
  });

  it('confirmation still names the model when one was chosen', async () => {
    await sendTribeOsWaitlistConfirmation({ ...base, pricingPreference: 'monthly_30' });
    expect((send.mock.calls[0][0] as { text: string }).text).toContain(
      'Tu preferencia de precios es treinta dólares al mes.'
    );
  });

  it('admin notification says the form did not ask', async () => {
    await sendTribeOsWaitlistAdminNotification({
      ...base,
      pricingPreference: null,
      comments: null,
      createdAt: '2026-10-17T12:00:00Z',
    });
    expect((send.mock.calls[0][0] as { text: string }).text).toContain('Pricing preference: (not asked)');
  });
});
