/**
 * T-AV28: the claimed pass shows ONE instruction. With a voucher QR (the
 * athletes flag on for this gym) it is the QR's line; without one it is the
 * line main has always shown, unchanged.
 *
 * Mutation proof: render the recepción line unconditionally ->
 * "with a voucher QR: only the QR line" goes red.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('server-only', () => ({}));
import { renderQrSvg } from '@/lib/qr/renderQrSvg';
import PaseForm from './PaseForm';

const SLUG = 'bullbox-prueba';
const PASS = {
  passCode: 'BU-G7KX',
  whatsappUrl: null,
  storefrontUrl: null,
  email: 'laura@example.com',
};
const props = {
  slug: SLUG,
  partnerName: 'BullBox (Prueba)',
  options: {},
  consentText: 'x',
  consentPolicyPath: '/legal/tratamiento-de-datos/',
};
const QR_LINE = 'Muéstralo en la entrada. El coach lo escanea y listo.';
const RECEPTION_LINE = 'Muéstralo en recepción o menciónalo por WhatsApp.';

beforeEach(() => sessionStorage.clear());

describe('the claimed pass instruction', () => {
  it('with a voucher QR: only the QR line', async () => {
    const qrSvg = renderQrSvg('http://localhost/pase/verificar/BU-G7KX/', 'pase BU-G7KX');
    sessionStorage.setItem(`tribe:pase:${SLUG}`, JSON.stringify({ ...PASS, qrSvg }));
    render(<PaseForm {...props} />);
    expect(await screen.findByText(QR_LINE)).toBeTruthy();
    expect(screen.queryByText(RECEPTION_LINE)).toBeNull();
  });

  it('without a QR (flag off, as on main): the recepción line, unchanged', async () => {
    sessionStorage.setItem(`tribe:pase:${SLUG}`, JSON.stringify(PASS));
    render(<PaseForm {...props} />);
    expect(await screen.findByText(RECEPTION_LINE)).toBeTruthy();
    expect(screen.queryByText(QR_LINE)).toBeNull();
  });
});
