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
 * Create a Wompi transaction
 * Returns transaction ID and redirect URL for payment widget
 */
export async function createWompiTransaction(
  params: WompiCreateTransactionParams
): Promise<{ transaction_id: string; redirect_url: string } | null> {
  try {
    const { privateKey } = getCredentials();
    const baseUrl = getBaseUrl();

    const payload = {
      amount_in_cents: params.amountCents,
      currency: params.currency,
      customer_email: params.customerEmail,
      reference: params.reference,
      redirect_url: params.redirectUrl,
    };

    const response = await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${privateKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      let errorData: Record<string, unknown> = {};
      try {
        errorData = JSON.parse(errorText) as Record<string, unknown>;
      } catch {
        errorData = { raw: errorText };
      }
      logError(new Error(`Wompi API error: HTTP ${response.status} — ${JSON.stringify(errorData)}`), {
        action: 'createWompiTransaction',
        status: response.status,
        statusText: response.statusText,
        error: errorData,
        isSandbox: process.env.WOMPI_SANDBOX === 'true',
        baseUrl,
      });
      return null;
    }

    const data = (await response.json()) as { data?: WompiTransaction };

    if (!data.data) {
      logError(new Error('Invalid Wompi response: missing data field'), {
        action: 'createWompiTransaction',
        response: data,
      });
      return null;
    }

    return {
      transaction_id: data.data.id,
      redirect_url: data.data.redirect_url,
    };
  } catch (error) {
    logError(error, { action: 'createWompiTransaction', params });
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

    return signature === expectedSignature;
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
