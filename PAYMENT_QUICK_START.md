# Payment Integration Quick Start

This quick-start guide gets your payment system up and running in 15 minutes.

## 1. Install Dependencies (1 min)

```bash
npm install stripe
```

## 2. Add Environment Variables (2 min)

Add to `.env.local`:

```bash
# Wompi (Colombia) - Get from Wompi Dashboard
WOMPI_PUBLIC_KEY=your-wompi-public-key
WOMPI_PRIVATE_KEY=your-wompi-private-key
WOMPI_EVENTS_SECRET=your-wompi-events-secret
WOMPI_SANDBOX=true

# Stripe (US) - Get from Stripe Dashboard
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key
STRIPE_WEBHOOK_SECRET=your-stripe-webhook-secret
```

## 3. Create Database Tables (5 min)

Run in Supabase SQL Editor:

```sql
-- Create payments table
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('COP', 'USD')),
  gateway TEXT NOT NULL CHECK (gateway IN ('wompi', 'stripe')),
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('pending', 'processing', 'approved', 'declined', 'voided', 'error')),
  platform_fee_cents INTEGER NOT NULL,
  instructor_payout_cents INTEGER NOT NULL,
  wompi_transaction_id TEXT,
  wompi_status TEXT,
  stripe_payment_intent_id TEXT,
  stripe_session_id TEXT,
  stripe_last_error TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Create indexes for fast lookups
CREATE INDEX idx_payments_session_id ON payments(session_id);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_wompi_transaction_id ON payments(wompi_transaction_id);
CREATE INDEX idx_payments_stripe_payment_intent_id ON payments(stripe_payment_intent_id);

-- Update sessions table
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS participation_fee_cents INTEGER DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD' CHECK (currency IN ('COP', 'USD'));
```

## 4. Test Payment Creation (2 min)

### For USD (Stripe):

```bash
curl -X POST http://localhost:3000/api/payment/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "session_id": "sess_test_123"
  }'
```

### For COP (Wompi):

First set a session's currency to COP, then:

```bash
curl -X POST http://localhost:3000/api/payment/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "session_id": "sess_test_cop"
  }'
```

## 5. Test Stripe Webhook (2 min)

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Authenticate
stripe login

# Forward webhooks to your local server
stripe listen --forward-to localhost:3000/api/payment/webhook/stripe

# In another terminal, trigger a test event
stripe trigger payment_intent.succeeded
```

## 6. Configure Webhooks in Dashboards (3 min)

### Wompi Dashboard:
1. Go to Settings → Webhooks
2. Add endpoint: `https://your-domain.com/api/payment/webhook/wompi`
3. Copy the webhook secret → Add to `WOMPI_EVENTS_SECRET`

### Stripe Dashboard:
1. Go to Developers → Webhooks
2. Add endpoint: `https://your-domain.com/api/payment/webhook/stripe`
3. Copy the signing secret → Add to `STRIPE_WEBHOOK_SECRET`
4. Subscribe to events:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`

## 7. Create a Session with Payment Fee (1 min)

```typescript
// lib/actions/sessions.ts
import { createSession } from '@/lib/dal/sessions';

const result = await createSession(supabase, {
  sport: 'basketball',
  location: 'NYC',
  creator_id: user.id,
  date: '2026-04-15',
  start_time: '18:00',
  duration: 90,
  currency: 'COP',  // or 'USD'
  participation_fee_cents: 50000,  // 500,000 COP = ~$130 USD
});
```

## 8. Initiate Payment from Client (1 min)

```typescript
// components/PaymentButton.tsx
import { initiatePayment } from '@/lib/actions/payment';

export function PaymentButton({ sessionId }: { sessionId: string }) {
  const handlePayment = async () => {
    const result = await initiatePayment(sessionId);
    
    if (result.success) {
      if (result.data.gateway === 'wompi') {
        window.location.href = result.data.redirect_url;
      } else if (result.data.gateway === 'stripe') {
        window.location.href = result.data.checkout_url;
      }
    }
  };

  return <button onClick={handlePayment}>Pay Now</button>;
}
```

## File Structure Reference

```
lib/payments/
├── config.ts          # Gateway logic, fee calculation
├── wompi.ts           # Wompi integration
├── stripe.ts          # Stripe integration
└── index.ts           # Exports

lib/dal/
└── payments.ts        # Database operations

app/api/payment/
├── create/route.ts    # Create payment session
└── webhook/
    ├── wompi/route.ts  # Wompi webhook
    └── stripe/route.ts # Stripe webhook
```

## Common Tasks

### Check Payment Status

```typescript
import { fetchPayment } from '@/lib/dal/payments';
import { createClient } from '@/lib/supabase/server';

const supabase = await createClient();
const result = await fetchPayment(supabase, 'pay_123');

if (result.success) {
  console.log(`Status: ${result.data.status}`);
  console.log(`Gateway: ${result.data.gateway}`);
}
```

### Get Session Revenue

```typescript
import { fetchSessionPayments } from '@/lib/dal/payments';

const result = await fetchSessionPayments(supabase, 'sess_123');

const approved = result.data.filter(p => p.status === 'approved');
const totalRevenue = approved.reduce((sum, p) => sum + p.instructor_payout_cents, 0);
const platformEarnings = approved.reduce((sum, p) => sum + p.platform_fee_cents, 0);

console.log(`Instructor gets: $${totalRevenue / 100}`);
console.log(`Platform keeps: $${platformEarnings / 100}`);
```

### Get Instructor Payouts

```typescript
import { fetchInstructorPayouts } from '@/lib/dal/payments';

const result = await fetchInstructorPayouts(supabase, instructorId);

const totalPayout = result.data.reduce((sum, p) => sum + p.instructor_payout_cents, 0);
console.log(`Total payouts: $${totalPayout / 100}`);
```

## Sandbox Testing Credentials

### Wompi Sandbox:
- Public Key: Available in Wompi Dashboard
- Test cards available in Wompi docs
- Set `WOMPI_SANDBOX=true`

### Stripe Sandbox:
- Use Stripe test cards:
  - Success: `4242 4242 4242 4242`
  - Decline: `4000 0000 0000 0002`
- Use any future expiry date
- Use any 3-digit CVC

## Troubleshooting

### "Missing Wompi credentials"
→ Check `WOMPI_PUBLIC_KEY` and `WOMPI_PRIVATE_KEY` in `.env.local`

### "Invalid Stripe signature"
→ Verify `STRIPE_WEBHOOK_SECRET` matches your webhook endpoint secret

### "Session not found"
→ Ensure session exists and has `participation_fee_cents` > 0

### Payment not updating after webhook
→ Check webhook logs in provider dashboard
→ Verify service role key has database permissions
→ Test webhook with curl to ensure endpoint is reachable

## Next Steps

1. Test payment flow end-to-end
2. Build payment confirmation page
3. Add payment history UI
4. Set up instructor Stripe Connect (optional)
5. Add refund handling (optional)
6. Implement retry logic for failed webhooks (optional)

## Documentation

For detailed information, see `PAYMENT_INTEGRATION.md`
