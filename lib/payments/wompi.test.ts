import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { createWompiTransaction } from './wompi';

/**
 * Locks in the Wompi Web Checkout contract: the redirect URL must carry the
 * correct integrity signature = sha256(reference + amount_in_cents + currency
 * + integrity_secret), the literal `signature:integrity` key, and encoded
 * redirect-url / customer-email.
 */
describe('createWompiTransaction (Web Checkout)', () => {
  const PUB = 'pub_test_abc123';
  const INTEGRITY = 'test_integrity_secret_xyz';

  beforeEach(() => {
    process.env.WOMPI_PUBLIC_KEY = PUB;
    process.env.WOMPI_INTEGRITY_SECRET = INTEGRITY;
  });
  afterEach(() => {
    delete process.env.WOMPI_PUBLIC_KEY;
    delete process.env.WOMPI_INTEGRITY_SECRET;
  });

  it('builds a checkout.wompi.co URL with the correct integrity signature', async () => {
    const params = {
      amountCents: 2_000_000,
      currency: 'COP' as const,
      customerEmail: 'ana@example.com',
      reference: 'pay-123',
      redirectUrl: 'https://tribe-v3.vercel.app/payment/confirm?payment_id=pay-123',
    };

    const result = await createWompiTransaction(params);
    expect(result).not.toBeNull();
    const url = new URL(result!.redirect_url);

    expect(`${url.origin}${url.pathname}`).toBe('https://checkout.wompi.co/p/');
    expect(url.searchParams.get('public-key')).toBe(PUB);
    expect(url.searchParams.get('currency')).toBe('COP');
    expect(url.searchParams.get('amount-in-cents')).toBe('2000000');
    expect(url.searchParams.get('reference')).toBe('pay-123');
    expect(url.searchParams.get('redirect-url')).toBe(params.redirectUrl);
    expect(url.searchParams.get('customer-email')).toBe('ana@example.com');

    const expectedSig = crypto.createHash('sha256').update(`pay-1232000000COP${INTEGRITY}`).digest('hex');
    // The literal key is `signature:integrity`.
    expect(url.searchParams.get('signature:integrity')).toBe(expectedSig);
  });

  it('returns null when the integrity secret is missing', async () => {
    delete process.env.WOMPI_INTEGRITY_SECRET;
    const result = await createWompiTransaction({
      amountCents: 2_000_000,
      currency: 'COP',
      customerEmail: 'a@b.com',
      reference: 'pay-9',
      redirectUrl: 'https://example.com/return',
    });
    expect(result).toBeNull();
  });

  it('returns null when the public key is missing', async () => {
    delete process.env.WOMPI_PUBLIC_KEY;
    const result = await createWompiTransaction({
      amountCents: 2_000_000,
      currency: 'COP',
      customerEmail: 'a@b.com',
      reference: 'pay-9',
      redirectUrl: 'https://example.com/return',
    });
    expect(result).toBeNull();
  });
});
