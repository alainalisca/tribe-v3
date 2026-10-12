/**
 * T-GROW2 share moment 1: the claimed pass shows "Trae a un amigo" when the
 * claim carried a lead code, sharing THIS pass with the spec's draft copy, and
 * shows nothing for a pass stored before codes existed (no broken link).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import PaseForm from './PaseForm';
import { SITE_URL } from '@/lib/http/siteUrl';

const SLUG = 'bullbox';
const PASS = { passCode: 'BB-G7KX', whatsappUrl: null, storefrontUrl: null, email: 'laura@example.com' };
const props = {
  slug: SLUG,
  partnerName: 'CrossFit BullBox',
  options: {},
  consentText: 'x',
  consentPolicyPath: '/legal/tratamiento-de-datos/',
};

beforeEach(() => sessionStorage.clear());

describe('PaseForm "Trae a un amigo"', () => {
  it('with a lead code: WhatsApp opens with the spec copy and this pass, carrying the code', async () => {
    sessionStorage.setItem(`tribe:pase:${SLUG}`, JSON.stringify({ ...PASS, refCode: 'KQ7M2Z' }));
    render(<PaseForm {...props} />);
    const wa = await screen.findByRole('link', { name: /Compartir por WhatsApp/ });
    const text = decodeURIComponent((wa.getAttribute('href') ?? '').replace('https://wa.me/?text=', ''));
    expect(text).toBe(
      `Voy a una clase gratis en CrossFit BullBox con Tribe. Vente conmigo: ${SITE_URL}/pase/bullbox/?ref=KQ7M2Z&src=referral`
    );
    expect(screen.getByRole('heading', { name: 'Trae a un amigo' })).toBeTruthy();
  });

  it('a pass stored before codes existed shows no card at all', async () => {
    sessionStorage.setItem(`tribe:pase:${SLUG}`, JSON.stringify(PASS));
    render(<PaseForm {...props} />);
    expect(await screen.findByText('BB-G7KX')).toBeTruthy();
    expect(screen.queryByText('Trae a un amigo')).toBeNull();
  });
});
