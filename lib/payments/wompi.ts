/**
 * Wompi Payment Gateway Integration
 * Handles Colombian peso (COP) payments via Wompi
 * Docs: https://docs.wompi.co/en/docs/colombia/
 */

import { logError } from '@/lib/logger';
import { PaymentStatus } from './config';
import crypto from 'crypto';

const SANDBOX_BASE_URL = 'https://sandbox.wompi.co/v1';
const PRODUCTION_BASE_URL = 'https://production.wompi.co/v1';

// Wompi Web Checkout (hosted payment page). Same host for sandbox and prod —
// the public key (pub_test_ vs pub_prod_) selects the environment.
const CHECKOUT_BASE_URL = 'https://checkout.wompi.co/p/';

interface WompiCreateTransactionParams {
  amountCents: number;
  currency: 'COP';
  customerEmail: string;
  reference: string; // Unique transaction reference (use payment_id)
  redirectUrl: string;
  paymentMethod?: 'CARD' | 'NEQUI' | 'PSE';
}

interface WompiTransaction {
  id: string;
  reference: string;
  amount_in_cents: number;
  currency: string;
  customer_email: string;
  status: string;
  redirect_url: string;
  created_at: string;
  updated_at: string;
}

interface WompiWebhookData {
  transaction?: {
    id: string;
    reference: string;
    amount_in_cents: number;
    currency: string;
    status: string;
    payment_method?: {
      type: string;
    };
  };
  timestamp?: string;
}

/**
 * Get base URL based on environment
 */
function getBaseUrl(): string {
  const isSandbox = process.env.WOMPI_SANDBOX === 'true';
  return isSandbox ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL;
}

/**
 * Get Wompi API credentials
 */
function getCredentials() {
  const publicKey = process.env.WOMPI_PUBLIC_KEY;
  const privateKey = process.env.WOMPI_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    throw new Error('Missing Wompi credentials: WOMPI_PUBLIC_KEY or WOMPI_PRIVATE_KEY');
  }

  return { publicKey, privateKey };
}

/**
 * Build a Wompi Web Checkout redirect URL.
 *
 * Wompi has no server-side "create a hosted transaction" endpoint. The
 * /transactions API requires a tokenized payment source and never returns a
 * redirect URL, so it cannot drive a hosted checkout. The hosted payment page
 * is Web Checkout: we redirect the customer to checkout.wompi.co with the
 * amount, reference, redirect-url and an integrity signature. Wompi creates
 * the transaction when the customer pays, then redirects back (with ?id=) and
 * fires the events webhook — which carries the transaction id and our
 * reference, and is where the payment is finalized.
 *
 * Integrity signature = sha256hex(reference + amount_in_cents + currency + integrity_secret).
 * Requires WOMPI_PUBLIC_KEY and WOMPI_INTEGRITY_SECRET (Wompi dashboard →
 * Developers; the integrity secret is distinct from the events secret). The
 * public key (pub_test_ vs pub_prod_) selects sandbox vs production.
 *
 * No transaction id exists yet at this point — it is assigned when the
 * customer pays. The webhook matches the row by `reference` and back-fills
 * gateway_payment_id before finalizing.
 */
export async function createWompiTransaction(
  params: WompiCreateTransactionParams
): Promise<{ redirect_url: string } | null> {
  try {
    const publicKey = process.env.WOMPI_PUBLIC_KEY;
    const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;

    if (!publicKey || !integritySecret) {
      logError(new Error('Missing Wompi Web Checkout config'), {
        action: 'createWompiTransaction',
        hasPublicKey: !!publicKey,
        hasIntegritySecret: !!integritySecret,
      });
      return null;
    }

    const amountInCents = Math.round(params.amountCents);
    const signature = crypto
      .createHash('sha256')
      .update(`${params.reference}${amountInCents}${params.currency}${integritySecret}`)
      .digest('hex');

    // Build the query manually: the `signature:integrity` key must keep its
    // literal colon (URLSearchParams would percent-encode it and Wompi would
    // not recognize it). Values are individually encoded.
    const query = [
      ['public-key', publicKey],
      ['currency', params.currency],
      ['amount-in-cents', String(amountInCents)],
      ['reference', params.reference],
      ['signature:integrity', signature],
      ['redirect-url', params.redirectUrl],
      ['customer-email', params.customerEmail],
    ]
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');

    return { redirect_url: `${CHECKOUT_BASE_URL}?${query}` };
  } catch (error) {
    logError(error, { action: 'createWompiTransaction', reference: params.reference });
    return null;
  }
}

/**
 * Fetch Wompi transaction details by ID
 */
export async function getWompiTransaction(transactionId: string): Promise<WompiTransaction | null> {
  try {
    const { publicKey } = getCredentials();
    const baseUrl = getBaseUrl();

    const response = await fetch(`${baseUrl}/transactions/${transactionId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${publicKey}`,
      },
    });

    if (!response.ok) {
      logError(new Error('Wompi API error'), {
        action: 'getWompiTransaction',
        transactionId,
        status: response.status,
      });
      return null;
    }

    const data = (await response.json()) as { data?: WompiTransaction };
    return data.data || null;
  } catch (error) {
    logError(error, { action: 'getWompiTransaction', transactionId });
    return null;
  }
}

/**
 * Verify Wompi webhook signature using HMAC SHA256
 * Signature = SHA256(concatenation of transaction properties + timestamp + events_secret)
 */
export function verifyWompiWebhookSignature(body: string, signature: string, timestamp: string): boolean {
  try {
    const eventsSecret = process.env.WOMPI_EVENTS_SECRET;

    if (!eventsSecret) {
      logError(new Error('Missing WOMPI_EVENTS_SECRET'), {
        action: 'verifyWompiWebhookSignature',
      });
      return false;
    }

    const data = JSON.parse(body) as WompiWebhookData;
    const transaction = data.transaction;

    if (!transaction) {
      return false;
    }

    // Reject webhooks older than 5 minutes to prevent replay attacks
    const webhookAgeMs = Date.now() - parseInt(timestamp) * 1000;
    const MAX_AGE_MS = 5 * 60 * 1000;
    if (webhookAgeMs > MAX_AGE_MS) {
      logError(new Error(`Webhook too old: ${webhookAgeMs}ms`), { action: 'verifyWompiWebhookSignature' });
      return false;
    }

    // Build the concatenated string as per Wompi documentation
    // Format: id.reference.amount_in_cents.currency.status.timestamp.events_secret
    const toHash = `${transaction.id}.${transaction.reference}.${transaction.amount_in_cents}.${transaction.currency}.${transaction.status}.${timestamp}.${eventsSecret}`;

    const expectedSignature = crypto.createHash('sha256').update(toHash).digest('hex');

    // T1-8: constant-time compare to avoid a timing side-channel (matches how
    // Stripe's library verifier behaves). Guard against length mismatch first —
    // timingSafeEqual throws if the buffers differ in length.
    const provided = Buffer.from(signature, 'hex');
    const expected = Buffer.from(expectedSignature, 'hex');
    if (provided.length !== expected.length) return false;
    return crypto.timingSafeEqual(provided, expected);
  } catch (error) {
    logError(error, { action: 'verifyWompiWebhookSignature' });
    return false;
  }
}

/**
 * Map Wompi transaction status to PaymentStatus
 */
export function mapWompiStatus(wompiStatus: string): PaymentStatus {
  switch (wompiStatus?.toUpperCase()) {
    case 'APPROVED':
      return 'approved';
    case 'DECLINED':
      return 'declined';
    case 'VOIDED':
      return 'voided';
    case 'ERROR':
      return 'error';
    case 'PENDING':
    default:
      return 'processing';
  }
}

/**
 * Creates a void/refund for a Wompi transaction.
 * Wompi uses void for pending transactions, refund for completed ones.
 */
export async function createWompiRefund(
  transactionId: string,
  amountCents: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const baseUrl = getBaseUrl();

    const response = await fetch(`${baseUrl}/transactions/${transactionId}/void`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.WOMPI_PRIVATE_KEY}`,
      },
      body: JSON.stringify({ amount_in_cents: amountCents }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logError(new Error(`Wompi refund failed: ${response.status}`), {
        action: 'createWompiRefund',
        transactionId,
        responseBody: errorBody,
      });
      return { success: false, error: `Wompi refund failed: ${response.status}` };
    }

    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown Wompi refund error';
    logError(error, { action: 'createWompiRefund', transactionId });
    return { success: false, error: message };
  }
}

/**
 * Extract transaction data from Wompi webhook
 */
export function extractWompiTransactionData(body: string): Omit<WompiTransaction, 'created_at' | 'updated_at'> | null {
  try {
    const data = JSON.parse(body) as WompiWebhookData;
    const transaction = data.transaction;

    if (!transaction) {
      return null;
    }

    return {
      id: transaction.id,
      reference: transaction.reference,
      amount_in_cents: transaction.amount_in_cents,
      currency: transaction.currency,
      customer_email: '', // Not provided in webhook, will be loaded from DB
      status: transaction.status,
      redirect_url: '', // Not provided in webhook
    };
  } catch (error) {
    logError(error, { action: 'extractWompiTransactionData' });
    return null;
  }
}
