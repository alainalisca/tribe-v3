# Dual Payment Gateway Integration Guide

This document outlines the payment gateway integration for Tribe V3, supporting both Wompi (Colombia - COP) and Stripe (US - USD).

## Architecture Overview

The payment system routes transactions to the appropriate gateway based on currency:
- **COP (Colombian Peso)** → Wompi
- **USD (US Dollar)** → Stripe

### File Structure

```
lib/payments/
├── config.ts          # Gateway selection & fee calculation logic
├── wompi.ts           # Wompi REST API integration
├── stripe.ts          # Stripe SDK integration
└── index.ts           # Module exports

lib/dal/
└── payments.ts        # Payment DAL operations

app/api/payment/
├── create/route.ts    # POST - Create payment session
└── webhook/
    ├── wompi/route.ts  # Wompi webhook handler
    └── stripe/route.ts # Stripe webhook handler
```

## Configuration

### Environment Variables

Add these to `.env.local`:

```bash
# Wompi (Colombia)
WOMPI_PUBLIC_KEY=your-wompi-public-key
WOMPI_PRIVATE_KEY=your-wompi-private-key
WOMPI_EVENTS_SECRET=your-wompi-events-secret
WOMPI_SANDBOX=true  # Set to 'false' for production

# Stripe (US)
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret

# Site URL (for redirect URLs)
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

### Database Schema

You'll need a `payments` table:

```sql
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('COP', 'USD')),
  gateway TEXT NOT NULL CHECK (gateway IN ('wompi', 'stripe')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'approved', 'declined', 'voided', 'error')),
  platform_fee_cents INTEGER NOT NULL,
  instructor_payout_cents INTEGER NOT NULL,
  
  -- Wompi fields
  wompi_transaction_id TEXT,
  wompi_status TEXT,
  
  -- Stripe fields
  stripe_payment_intent_id TEXT,
  stripe_session_id TEXT,
  stripe_last_error TEXT,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  INDEXES:
  - session_id (for fetching session payments)
  - user_id (for user payment history)
  - stripe_payment_intent_id (for webhook lookups)
  - wompi_transaction_id (for webhook lookups)
);
```

Also update `sessions` table to include:
```sql
ALTER TABLE sessions ADD COLUMN participation_fee_cents INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN currency TEXT DEFAULT 'USD' CHECK (currency IN ('COP', 'USD'));
```

## API Endpoints

### 1. Create Payment Session
**POST** `/api/payment/create`

**Request:**
```json
{
  "session_id": "sess_123",
  "payment_method": "PSE"  // Optional, defaults to PSE for Wompi
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "gateway": "wompi",
    "payment_id": "pay_1234567890",
    "redirect_url": "https://checkout.wompi.co/..."  // For Wompi
    // OR
    "checkout_url": "https://checkout.stripe.com/..."  // For Stripe
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Session not found"
}
```

### 2. Wompi Webhook
**POST** `/api/payment/webhook/wompi`

Wompi sends transaction status updates to this endpoint. The signature is verified using HMAC SHA256.

**Headers:**
```
x-signature: <hmac-sha256-signature>
x-timestamp: <unix-timestamp>
```

**Body (Example):**
```json
{
  "transaction": {
    "id": "tx_123",
    "reference": "pay_1234567890",
    "amount_in_cents": 100000,
    "currency": "COP",
    "status": "APPROVED"
  },
  "timestamp": "1234567890"
}
```

### 3. Stripe Webhook
**POST** `/api/payment/webhook/stripe`

Stripe sends payment events to this endpoint. The signature is verified using Stripe's native verification.

**Headers:**
```
stripe-signature: t=<timestamp>,v1=<signature>
```

**Supported Events:**
- `checkout.session.completed` - Checkout session completed
- `payment_intent.succeeded` - Payment succeeded
- `payment_intent.payment_failed` - Payment failed

## Usage Examples

### Client-Side: Initiating Payment

```typescript
// lib/actions/payment.ts
async function initiatePayment(sessionId: string) {
  const response = await fetch('/api/payment/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });

  const result = await response.json();

  if (result.success) {
    if (result.data.gateway === 'wompi') {
      // Redirect to Wompi payment widget
      window.location.href = result.data.redirect_url;
    } else if (result.data.gateway === 'stripe') {
      // Redirect to Stripe Checkout
      window.location.href = result.data.checkout_url;
    }
  }
}
```

### Server-Side: Using Payment DAL

```typescript
// app/route.ts or other server components
import { createClient } from '@/lib/supabase/server';
import { fetchSessionPayments, createPayment } from '@/lib/dal/payments';

// Fetch payments for a session
const supabase = await createClient();
const result = await fetchSessionPayments(supabase, 'sess_123');

if (result.success) {
  const approvedPayments = result.data.filter(p => p.status === 'approved');
  const totalRevenue = approvedPayments.reduce((sum, p) => sum + p.instructor_payout_cents, 0);
}
```

### Server-Side: Using Payment Config

```typescript
import { getPaymentGateway, calculateFees, PLATFORM_FEE_PERCENT } from '@/lib/payments';

// Route to correct gateway
const currency = session.currency; // 'COP' or 'USD'
const gateway = getPaymentGateway(currency);

// Calculate fees
const amountCents = 100000; // $1000 or 100,000 COP
const { platformFeeCents, instructorPayoutCents } = calculateFees(amountCents);
console.log(`Platform: $${platformFeeCents / 100}, Instructor: $${instructorPayoutCents / 100}`);
```

## Key Implementation Details

### Fee Calculation
- **Platform Fee**: 10% of transaction amount (configurable via `PLATFORM_FEE_PERCENT`)
- **Instructor Payout**: 90% of transaction amount after fees
- All amounts stored in cents (integers) for precision

### Payment Status Lifecycle
```
pending → processing → approved/declined/voided/error
```

**Status Meanings:**
- `pending`: Payment created but not processed yet
- `processing`: Payment in progress (Stripe processing, Wompi pending)
- `approved`: Payment successful, funds received
- `declined`: Payment rejected by provider
- `voided`: Payment cancelled by user or merchant
- `error`: Payment failed due to technical error

### Webhook Verification

#### Wompi Signature Verification
```
signature = SHA256(id.reference.amount_in_cents.currency.status.timestamp.events_secret)
```

#### Stripe Signature Verification
Uses Stripe's built-in `webhooks.constructEvent()` method which validates:
1. Signature timestamp freshness (5-minute window)
2. HMAC SHA256 signature match

### Retry Logic
- **Wompi**: If webhook handler returns non-200, Wompi retries up to 5 times
- **Stripe**: If webhook handler returns non-200, Stripe retries for 3 days

Both webhook handlers return 200 even on error to prevent retry loops.

## Instructor Connect Accounts (Future)

For instructor payouts via Stripe, create Connect accounts:

```typescript
import { createStripeConnectAccount } from '@/lib/payments/stripe';

const result = await createStripeConnectAccount('instructor@example.com', 'US');
if (result) {
  console.log(`Stripe Connect Account: ${result.accountId}`);
}
```

Then use `stripe.transfers.create()` to send payouts:

```typescript
const stripe = getStripeInstance();
await stripe.transfers.create({
  amount: instructorPayoutCents,
  currency: 'usd',
  destination: instructorStripeAccountId,
  source_transaction: paymentIntentId,
});
```

## Testing Webhooks Locally

### Wompi Testing
Use Wompi's sandbox environment (set `WOMPI_SANDBOX=true`):
```bash
curl -X POST http://localhost:3000/api/payment/webhook/wompi \
  -H "Content-Type: application/json" \
  -H "x-signature: <calculated-signature>" \
  -H "x-timestamp: $(date +%s)" \
  -d '{
    "transaction": {
      "id": "tx_test",
      "reference": "pay_test",
      "amount_in_cents": 100000,
      "currency": "COP",
      "status": "APPROVED"
    }
  }'
```

### Stripe Testing
Use Stripe CLI for webhook forwarding:
```bash
stripe listen --forward-to localhost:3000/api/payment/webhook/stripe
stripe trigger payment_intent.succeeded
```

## Error Handling

All payment operations include comprehensive error logging via `logError()`:

```typescript
import { logError } from '@/lib/logger';

logError(error, {
  action: 'createPayment',
  sessionId,
  gateway,
});
```

Check logs in:
- Production: Cloud logging service (Vercel, etc.)
- Local: Console output and log files

## Security Considerations

1. **Webhook Verification**: Always verify signatures before processing
2. **Service Role Keys**: Use `SUPABASE_SERVICE_ROLE_KEY` only in webhook handlers
3. **Sensitive Data**: Never log payment method details or full amounts in user-facing errors
4. **HTTPS Only**: All payment URLs must use HTTPS in production
5. **Rate Limiting**: Consider adding rate limiting to payment creation endpoint
6. **User Auth**: Payment creation requires authenticated user (via `supabase.auth.getUser()`)

## Troubleshooting

### Wompi Transactions Not Updating
1. Verify `WOMPI_EVENTS_SECRET` is correct
2. Check webhook signature calculation matches Wompi's format
3. Ensure `WOMPI_SANDBOX` matches your environment
4. Review Wompi dashboard for failed deliveries

### Stripe Events Not Processing
1. Verify `STRIPE_WEBHOOK_SECRET` is correct
2. Use `stripe trigger` CLI to test events
3. Check Stripe dashboard > Webhooks > Signed Events
4. Ensure endpoint is publicly accessible

### Missing Payment Records
1. Verify `payments` table exists and has correct schema
2. Check `SUPABASE_SERVICE_ROLE_KEY` permissions
3. Review webhook handler logs for errors
4. Manually test webhook endpoints with curl

## Next Steps

1. Create and migrate `payments` table to Supabase
2. Add `participation_fee_cents` and `currency` columns to `sessions` table
3. Install Stripe SDK: `npm install stripe`
4. Configure all environment variables in `.env.local`
5. Set up webhook endpoints in Wompi and Stripe dashboards
6. Test payment flow in sandbox environment
7. Implement Stripe Connect for instructor payouts (optional)
8. Add payment UI components and client-side logic
