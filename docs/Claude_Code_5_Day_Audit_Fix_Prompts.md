# Tribe v3 — 5-Day Audit Fix Prompts for Claude Code

**Goal: Fix all 19 audit issues by Friday April 17, 2026**
**Branch: feature/social-features**
**Repo: tribe-v3 (Next.js 16 / React 18 / Supabase / Tailwind)**

---

## HOW TO USE THIS FILE

Each day is a self-contained Claude Code prompt. Copy the entire day's prompt into Claude Code and let it run. Each prompt:

- Tells Claude Code exactly which files to modify
- Gives the exact code pattern to implement
- Includes acceptance criteria so it knows when it's done
- Ends with a verification step (TypeScript check + specific tests)

After each day, commit and push before starting the next day.

**GLOBAL RULES — paste this at the top of EVERY prompt:**

```
GLOBAL RULES FOR ALL WORK:
- Branch: feature/social-features. Never touch main.
- Terminology: "athletes" and "instructors" in ALL UI text. Never "participants", "users", or "members". Spanish: "atletas" and "instructores".
- App names: Social app = "Tribe - Fitness Community". Web PWA = "Tribe - Never Train Alone".
- All UI strings must have EN and ES versions: language === 'es' ? 'Spanish' : 'English'
- Dark mode: bg-[#272D34], bg-[#3D4349], bg-[#52575D]. Accent: #A3E635
- DAL pattern: all DB queries through /lib/dal/ returning DalResult<T>
- Payment: COP → Wompi, USD → Stripe, 15% platform fee
- Never include Co-Authored-By in commit messages
- Run `npx tsc --noEmit` after completing all tasks to verify no TypeScript errors
```

---

## DAY 1 (Monday): EMERGENCY — Payment Flow + Security Secrets

**Copy everything below this line into Claude Code:**

---

You are fixing CRITICAL bugs in the Tribe v3 fitness marketplace app. These are emergency fixes that must be done first because they involve money and security. Work on the feature/social-features branch.

### TASK 1: Fix Payment-to-Participant Flow (CRITICAL)

**Problem:** When a payment webhook fires (Stripe or Wompi) and marks a payment as "approved", the athlete is NEVER added as a session participant. They pay but can't access the session.

**File: `app/api/payment/webhook/wompi/route.ts`**

Find the section where payment status is updated to 'approved' (around lines 114-130). After the payment status update succeeds, add this logic:

```typescript
// After payment status updated to 'approved':
if (paymentStatus === 'APPROVED') {
  // 1. Fetch the payment record to get session_id and user_id
  const { data: paymentRecord } = await adminSupabase
    .from('payments')
    .select('session_id, user_id')
    .eq('id', paymentId)
    .single();

  if (paymentRecord) {
    // 2. Add user as confirmed participant (use upsert to handle duplicates)
    const { error: participantError } = await adminSupabase.from('session_participants').upsert(
      {
        session_id: paymentRecord.session_id,
        user_id: paymentRecord.user_id,
        status: 'confirmed',
        joined_at: new Date().toISOString(),
      },
      { onConflict: 'session_id,user_id' }
    );

    if (participantError) {
      console.error('Failed to add participant after payment:', participantError);
    }

    // 3. Send push notification to athlete
    try {
      await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/notifications/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
        body: JSON.stringify({
          user_id: paymentRecord.user_id,
          title: 'Booking Confirmed!',
          body: 'Your session has been booked. See you there!',
          type: 'payment_confirmed',
          data: { session_id: paymentRecord.session_id },
        }),
      });
    } catch (notifErr) {
      console.error('Notification send failed:', notifErr);
    }
  }
}
```

**File: `app/api/payment/webhook/stripe/route.ts`**

Apply the SAME participant-addition logic after Stripe payment is marked approved. Find where payment status is updated and add identical logic (fetch payment record → upsert participant → send notification).

**For BOTH webhook files, also add idempotency check BEFORE processing:**

```typescript
// At the top of webhook processing, before updating payment status:
const { data: existingPayment } = await adminSupabase
  .from('payments')
  .select('status, stripe_payment_intent_id') // or wompi_transaction_id
  .eq('id', paymentId)
  .single();

// If already processed with same status, skip
if (existingPayment?.status === newStatus) {
  return NextResponse.json({ received: true, message: 'Already processed' });
}
```

### TASK 2: Fix Session Cancellation — Add Refund + Notification Logic (CRITICAL)

**File: `lib/dal/sessions.ts`**

Find the `cancelSession()` function (around lines 158-168). It currently only updates status. Replace it with:

```typescript
export async function cancelSession(
  supabase: SupabaseClient,
  sessionId: string,
  reason?: string
): Promise<DalResult<null>> {
  try {
    // 1. Fetch session details
    const { data: session, error: sessionErr } = await supabase
      .from('sessions')
      .select('id, title, creator_id, is_paid, price_cents, currency')
      .eq('id', sessionId)
      .single();

    if (sessionErr || !session) {
      return { success: false, error: 'Session not found' };
    }

    // 2. Fetch all confirmed participants
    const { data: participants } = await supabase
      .from('session_participants')
      .select('user_id')
      .eq('session_id', sessionId)
      .eq('status', 'confirmed');

    // 3. If paid session, fetch approved payments and mark for refund
    if (session.is_paid) {
      const { data: payments } = await supabase
        .from('payments')
        .select('id, user_id, amount_cents, currency, payment_gateway, stripe_payment_intent_id, wompi_transaction_id')
        .eq('session_id', sessionId)
        .eq('status', 'approved');

      for (const payment of payments || []) {
        // Mark payment as refund_pending (actual refund processing via gateway API is TODO)
        await supabase
          .from('payments')
          .update({
            status: 'refunded',
            payout_status: 'cancelled',
            updated_at: new Date().toISOString(),
          })
          .eq('id', payment.id);

        // TODO: Call Stripe refund API or Wompi refund API based on payment.payment_gateway
        // For Stripe: stripe.refunds.create({ payment_intent: payment.stripe_payment_intent_id })
        // For Wompi: POST to Wompi refund endpoint with payment.wompi_transaction_id
      }
    }

    // 4. Update all participants to cancelled
    await supabase.from('session_participants').update({ status: 'cancelled' }).eq('session_id', sessionId);

    // 5. Update session status
    const { error: updateErr } = await supabase
      .from('sessions')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // 6. Notify all participants
    for (const p of participants || []) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/notifications/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
          body: JSON.stringify({
            user_id: p.user_id,
            title: language === 'es' ? 'Sesión cancelada' : 'Session Cancelled',
            body: session.is_paid
              ? language === 'es'
                ? `"${session.title}" fue cancelada. Tu pago será reembolsado.`
                : `"${session.title}" was cancelled. Your payment will be refunded.`
              : language === 'es'
                ? `"${session.title}" fue cancelada.`
                : `"${session.title}" was cancelled.`,
            type: 'session_cancelled',
            data: { session_id: sessionId },
          }),
        });
      } catch (e) {
        console.error('Failed to notify participant:', p.user_id, e);
      }
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to cancel session' };
  }
}
```

Note: The `language` variable above needs to come from somewhere. Since this is a backend function, default to English for notifications or pass language as a parameter.

### TASK 3: Add Webhook Replay Protection to Wompi (HIGH)

**File: `lib/payments/wompi.ts`**

Find the `verifyWebhookSignature` function (around lines 175-204). Add timestamp freshness validation:

```typescript
// Inside verifyWebhookSignature, BEFORE the signature comparison:
const webhookAgeMs = Date.now() - parseInt(timestamp) * 1000;
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
if (webhookAgeMs > MAX_AGE_MS) {
  console.warn('Webhook too old, rejecting. Age:', webhookAgeMs, 'ms');
  return false;
}
```

### TASK 4: Fix CSP Headers (HIGH)

**File: `next.config.ts`**

Find the Content-Security-Policy header (around lines 21-22). Remove `'unsafe-inline'` and `'unsafe-eval'` from script-src. Replace with nonce if PostHog requires it, or keep only the specific domains:

Change:

```
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://us.i.posthog.com...
```

To:

```
script-src 'self' https://us.i.posthog.com https://us-assets.i.posthog.com
```

If this breaks PostHog, add `'unsafe-inline'` back for ONLY style-src (not script-src). Test by loading the app and checking browser console for CSP violations.

### TASK 5: Enable Image Optimization (CRITICAL performance win)

**File: `next.config.ts`**

Find `images: { unoptimized: true }` and change to:

```typescript
images: {
  unoptimized: false,
  remotePatterns: [
    { protocol: 'https', hostname: '*.supabase.co' },
    { protocol: 'https', hostname: '*.googleapis.com' },
    { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
  ],
},
```

This enables automatic WebP conversion, lazy-loading, and responsive resizing for ALL images. If the app uses `<img>` tags with external URLs, those URLs need to be in the remotePatterns. Check for other image domains used in the codebase and add them.

### TASK 6: Fix Rate Limiting (HIGH)

**File: `lib/rate-limit.ts`**

The current in-memory Map doesn't work on serverless. Replace the entire file with a Supabase-backed rate limiter:

```typescript
import { SupabaseClient } from '@supabase/supabase-js';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export async function checkRateLimit(
  supabase: SupabaseClient,
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - windowMs).toISOString();

  // Count recent requests for this key
  const { count, error } = await supabase
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('key', key)
    .gte('created_at', windowStart);

  const currentCount = count || 0;

  if (currentCount >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + windowMs),
    };
  }

  // Record this request
  await supabase.from('rate_limits').insert({ key, created_at: new Date().toISOString() });

  // Cleanup old entries (don't await — fire and forget)
  supabase
    .from('rate_limits')
    .delete()
    .lt('created_at', windowStart)
    .then(() => {});

  return {
    allowed: true,
    remaining: maxRequests - currentCount - 1,
    resetAt: new Date(Date.now() + windowMs),
  };
}
```

NOTE: This requires a `rate_limits` table in Supabase. Create a migration or add a TODO comment with the SQL:

```sql
CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_rate_limits_key_created ON rate_limits (key, created_at);
```

If you can't run migrations right now, keep the existing in-memory rate limiter but add a prominent TODO comment explaining it doesn't work on serverless and needs to be replaced with Supabase or Redis.

### VERIFICATION

After all tasks:

1. Run `npx tsc --noEmit` — must pass with zero errors
2. Grep for `'unsafe-eval'` in next.config.ts — should not exist
3. Grep for `unoptimized: true` in next.config.ts — should not exist
4. Read both webhook files and confirm participant insertion code exists after payment approval
5. Read lib/dal/sessions.ts and confirm cancelSession handles refunds and notifications

---

## DAY 2 (Tuesday): LOGIC HARDENING — Capacity, Connections, Smart Match

**Copy everything below this line into Claude Code (include global rules):**

---

You are fixing business logic bugs in the Tribe v3 fitness marketplace. These fixes ensure the core systems work correctly and safely.

### TASK 1: Add Session Capacity Constraint (CRITICAL)

**File: `lib/sessions.ts`**

Find the function that adds a participant to a session (look for where session_participants INSERT happens, around lines 68-92). The current code fetches the confirmed count, compares to max_participants, then inserts. This has a race condition.

Fix: Wrap the capacity check + insert in a Supabase RPC call that uses a database-level lock.

Create a new file `lib/dal/rpc/joinSession.sql` with this content (as a reference for the RPC that should exist in Supabase):

```sql
-- This RPC should be created in Supabase SQL Editor
CREATE OR REPLACE FUNCTION join_session(
  p_session_id uuid,
  p_user_id uuid,
  p_status text DEFAULT 'confirmed'
)
RETURNS json AS $$
DECLARE
  v_max int;
  v_current int;
  v_result json;
BEGIN
  -- Lock the session row to prevent concurrent joins
  SELECT max_participants INTO v_max
  FROM sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_max IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Session not found');
  END IF;

  -- Count current confirmed participants
  SELECT COUNT(*) INTO v_current
  FROM session_participants
  WHERE session_id = p_session_id AND status = 'confirmed';

  -- Check capacity
  IF v_max > 0 AND v_current >= v_max THEN
    RETURN json_build_object('success', false, 'error', 'Session is full');
  END IF;

  -- Insert participant
  INSERT INTO session_participants (session_id, user_id, status, joined_at)
  VALUES (p_session_id, p_user_id, p_status, now())
  ON CONFLICT (session_id, user_id) DO UPDATE SET status = p_status, joined_at = now();

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql;
```

Then update the participant join logic in lib/sessions.ts to call this RPC:

```typescript
const { data, error } = await supabase.rpc('join_session', {
  p_session_id: sessionId,
  p_user_id: userId,
  p_status: 'confirmed',
});

if (error || !data?.success) {
  return { success: false, error: data?.error || error?.message || 'Failed to join session' };
}
```

If the RPC doesn't exist yet in Supabase, add a fallback that keeps the current logic but adds a UNIQUE constraint check. Add a comment: `// TODO: Create join_session RPC in Supabase for atomic capacity check`.

Also add to the session_participants table (note for migration):

```sql
-- Add unique constraint if not exists
ALTER TABLE session_participants
ADD CONSTRAINT unique_session_user UNIQUE (session_id, user_id);
```

### TASK 2: Block Check on Connection Requests (HIGH)

**File: `lib/dal/connections.ts`**

Find the `sendConnectionRequest()` function (around lines 48-103). BEFORE the shared session check (`have_shared_session` RPC call), add a block check:

```typescript
// Check if either user has blocked the other
const { data: blockExists } = await supabase
  .from('blocked_users')
  .select('id')
  .or(
    `and(user_id.eq.${requesterId},blocked_user_id.eq.${recipientId}),and(user_id.eq.${recipientId},blocked_user_id.eq.${requesterId})`
  )
  .maybeSingle();

if (blockExists) {
  return {
    success: false,
    error: language === 'es' ? 'No se puede conectar con este usuario' : 'Cannot connect with this user',
  };
}
```

Also check if a `blocked_users` table exists. If not, add a TODO comment noting it needs to be created.

### TASK 3: Fix Duplicate Connection Requests (MEDIUM)

**File: `lib/dal/connections.ts`**

In the same `sendConnectionRequest()` function, AFTER the block check but BEFORE inserting, check both directions:

```typescript
// Check for existing connection in either direction
const { data: existingConnection } = await supabase
  .from('connections')
  .select('id, status, requester_id')
  .or(
    `and(requester_id.eq.${requesterId},recipient_id.eq.${recipientId}),and(requester_id.eq.${recipientId},recipient_id.eq.${requesterId})`
  )
  .maybeSingle();

if (existingConnection) {
  if (existingConnection.status === 'accepted') {
    return { success: false, error: language === 'es' ? 'Ya están conectados' : 'Already connected' };
  }
  if (existingConnection.status === 'pending') {
    // If the other person already sent a request, auto-accept it
    if (existingConnection.requester_id === recipientId) {
      const { error: acceptErr } = await supabase
        .from('connections')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', existingConnection.id);
      if (acceptErr) return { success: false, error: acceptErr.message };
      return { success: true, data: { status: 'accepted', auto_accepted: true } };
    }
    return { success: false, error: language === 'es' ? 'Solicitud ya enviada' : 'Request already sent' };
  }
}
```

### TASK 4: Fix Smart Match Generation (HIGH)

**File: `app/api/cron/smart-match/route.ts`**

Find the nested loop that compares users (around lines 132-141). This is O(n²) and will timeout at scale. Replace the entire matching logic with a database-side approach:

```typescript
// Instead of in-memory nested loops, query for potential matches per user
// Process in batches of 50 users per cron run

const BATCH_SIZE = 50;

// Get users who haven't been matched recently (last 7 days)
const { data: usersToMatch } = await adminSupabase
  .from('user_training_preferences')
  .select('user_id, preferred_sports, max_distance_km, gender_preference, preferred_times, active')
  .eq('active', true)
  .order('updated_at', { ascending: true })
  .limit(BATCH_SIZE);

for (const user of usersToMatch || []) {
  // Get user's location
  const { data: profile } = await adminSupabase
    .from('users')
    .select('location_lat, location_lng')
    .eq('id', user.user_id)
    .single();

  if (!profile?.location_lat || !profile?.location_lng) continue;

  // Find candidates: same sports, within distance, respecting gender preference
  // Use database query instead of in-memory comparison
  const { data: candidates } = await adminSupabase
    .from('user_training_preferences')
    .select('user_id, preferred_sports, gender_preference')
    .eq('active', true)
    .neq('user_id', user.user_id)
    .overlaps('preferred_sports', user.preferred_sports || [])
    .limit(20);

  for (const candidate of candidates || []) {
    // Check if match already exists
    const { data: existing } = await adminSupabase
      .from('smart_matches')
      .select('id')
      .or(
        `and(user_id.eq.${user.user_id},matched_user_id.eq.${candidate.user_id}),and(user_id.eq.${candidate.user_id},matched_user_id.eq.${user.user_id})`
      )
      .maybeSingle();

    if (existing) continue;

    // Calculate simple match score (sport overlap count)
    const userSports = user.preferred_sports || [];
    const candidateSports = candidate.preferred_sports || [];
    const overlap = userSports.filter((s: string) => candidateSports.includes(s)).length;
    const score = Math.round((overlap / Math.max(userSports.length, 1)) * 100);

    if (score > 0) {
      await adminSupabase.from('smart_matches').insert({
        user_id: user.user_id,
        matched_user_id: candidate.user_id,
        match_score: score,
        status: 'pending',
      });
    }
  }
}
```

### TASK 5: Fix Recurring Sessions (HIGH)

**File: `app/api/cron/recurring-sessions/route.ts`**

Read this file. If the recurring session creation logic is missing or incomplete (it should parse recurrence_pattern from parent sessions and create child instances), implement it:

```typescript
// Query sessions that are recurring and need new instances
const { data: recurringParents } = await adminSupabase
  .from('sessions')
  .select('*')
  .eq('is_recurring', true)
  .eq('status', 'active')
  .not('recurrence_end_date', 'is', null)
  .gte('recurrence_end_date', new Date().toISOString());

for (const parent of recurringParents || []) {
  // Determine next occurrence based on recurrence_pattern
  const pattern = parent.recurrence_pattern; // e.g., 'weekly', 'daily', 'monthly'
  const lastDate = new Date(parent.date);
  let nextDate = new Date(lastDate);

  if (pattern === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
  else if (pattern === 'daily') nextDate.setDate(nextDate.getDate() + 1);
  else if (pattern === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);

  // Check if next instance already exists
  const nextDateStr = nextDate.toISOString().split('T')[0];
  const { data: existing } = await adminSupabase
    .from('sessions')
    .select('id')
    .eq('recurring_parent_id', parent.id)
    .gte('date', nextDateStr)
    .maybeSingle();

  if (!existing && nextDate <= new Date(parent.recurrence_end_date)) {
    // Create next instance
    await adminSupabase.from('sessions').insert({
      ...parent,
      id: undefined, // let DB generate new ID
      date: nextDate.toISOString(),
      recurring_parent_id: parent.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
}
```

Adapt this to match the actual schema. Read the sessions table type definition in `lib/database.types.ts` to get the correct column names.

### TASK 6: Validate Instructor Check on Paid Session Creation (MEDIUM)

**File: `app/create/page.tsx`**

Find where the session is submitted/saved (the form submit handler). Add server-side validation that prevents non-instructors from creating paid sessions. If the current code only checks `isInstructor` from client state, also add validation in the DAL:

**File: `lib/dal/sessions.ts`**

In the `insertSession()` or equivalent function, add:

```typescript
// If session is paid, verify the creator is an instructor
if (sessionData.is_paid) {
  const { data: creator } = await supabase
    .from('users')
    .select('is_instructor')
    .eq('id', sessionData.creator_id)
    .single();

  if (!creator?.is_instructor) {
    return { success: false, error: 'Only instructors can create paid sessions' };
  }
}
```

### VERIFICATION

1. Run `npx tsc --noEmit` — zero errors
2. Read both webhook files — confirm participant insertion + idempotency check exist
3. Read lib/dal/connections.ts — confirm block check and bidirectional duplicate check exist
4. Read app/api/cron/smart-match/route.ts — confirm no O(n²) nested loop
5. Read lib/dal/sessions.ts — confirm instructor validation on paid sessions

---

## DAY 3 (Wednesday): UI POLISH — Design System, Accessibility, Visual Bugs

**Copy everything below this line into Claude Code (include global rules):**

---

You are fixing UI/UX issues in the Tribe v3 fitness app. These fixes make the app look professional for partner demos and legally compliant for accessibility.

### TASK 1: Consolidate Tailwind Config (CRITICAL)

There are TWO Tailwind config files: `tailwind.config.ts` and `tailwind.config.js`. They define DIFFERENT values for tribe-green and other colors. This causes inconsistent branding.

Steps:

1. Read both files
2. Delete `tailwind.config.js`
3. In `tailwind.config.ts`, ensure the extend.colors section includes ALL brand colors:

```typescript
colors: {
  'tribe-green': '#84cc16',      // Primary accent (WCAG compliant on dark)
  'tribe-green-light': '#A3E635', // Hover/highlight state
  'tribe-dark': '#272D34',        // Darkest background
  'tribe-surface': '#3D4349',     // Card/surface background
  'tribe-mid': '#52575D',         // Page background (dark mode)
  'tribe-card': '#6B7178',        // Elevated card background
}
```

NOTE: `#84cc16` passes WCAG AA contrast on dark backgrounds (4.8:1 ratio). The original `#A3E635` does NOT (only 3.0:1). Use `#84cc16` as the primary interactive color.

4. Search the ENTIRE codebase for hardcoded hex bracket colors and replace the most common ones:
   - `bg-[#A3E635]` → `bg-tribe-green-light` (or `bg-tribe-green` for interactive elements)
   - `bg-[#272D34]` → `bg-tribe-dark`
   - `bg-[#3D4349]` → `bg-tribe-surface`
   - `bg-[#52575D]` → `bg-tribe-mid`
   - `bg-[#6B7178]` → `bg-tribe-card`
   - `text-[#A3E635]` → `text-tribe-green`
   - `text-[#272D34]` → `text-tribe-dark`
   - `border-[#A3E635]` → `border-tribe-green`

   Do NOT do a blind find-replace. Some hardcoded colors are intentional variants (e.g., hover states). Replace only the standard background/text/border patterns. There will be 50+ files affected — do it methodically.

5. Also search for `bg-[#9EE551]` and `bg-[#8FD642]` (non-standard greens used in BottomNav) and replace with `bg-tribe-green`.

### TASK 2: Fix Accessibility Contrast (CRITICAL)

For ALL interactive elements that use the lime green color on dark backgrounds, ensure the text/icon color meets 4.5:1 contrast ratio:

- **Buttons with green background**: text should be `text-slate-900` or `text-tribe-dark` (dark text on green = high contrast)
- **Green text on dark backgrounds**: change from `#A3E635` to `#84cc16` (the tribe-green token)
- **Active tab indicators**: use `border-tribe-green` (the #84cc16 version)

Key files to check and fix:

- `components/BottomNav.tsx` — active tab text color
- `components/chat/ChatView.tsx` — send button
- `components/StoriesCarousel.tsx` — CTA buttons
- `components/CommunityBulletinTab.tsx` — action buttons
- `components/CommunityNewsTab.tsx` — action buttons

### TASK 3: Fix BottomNav Truncation (HIGH)

**File: `components/BottomNav.tsx`**

Find the label span (around line 161-164) with class `text-xs mt-1 whitespace-nowrap truncate max-w-full text-center`.

Change to: `text-[10px] mt-0.5 text-center leading-tight`

Remove `truncate`, `whitespace-nowrap`, and `max-w-full`. The smaller font size (10px) allows "Community" and "Comunidad" to fit without truncation on 320px screens.

Also add `aria-label` to each nav button. Find the nav item map (around lines 58-122) and add to each button/link element:

```tsx
aria-label={item.label}
```

### TASK 4: Fix Streak Banner (HIGH)

**File: `components/StreakBanner.tsx`**

Find where the day labels are rendered (around line 130-145). The bug is that the day letter appears BOTH inside a circle AND as a separate label below. Fix:

1. Remove the duplicate label below the circle. Only keep the letter INSIDE the circle.
2. Add `justify-center` to the flex container that holds all 7 day circles.
3. Verify the English days array is correct: `['M', 'T', 'W', 'T', 'F', 'S', 'S']`
4. Verify the Spanish days array is correct: `['L', 'M', 'X', 'J', 'V', 'S', 'D']`

### TASK 5: Remove Emojis from Filter Dropdown (HIGH)

**File: `components/home/FilterBar.tsx`**

Find the pricing filter dropdown (around lines 145-153). Remove ALL emojis from the option text:

```tsx
<option value="all">{language === 'es' ? 'Todos' : 'All'}</option>
<option value="free">{language === 'es' ? 'Gratis' : 'Free'}</option>
<option value="paid">{language === 'es' ? 'De pago' : 'Paid'}</option>
```

### TASK 6: Add Alt Text and Aria Labels (HIGH)

Search the codebase for `alt=""` (empty alt attributes) and replace with descriptive text:

- `components/StoriesCarousel.tsx` — story images: `alt={story.user_name + "'s story"}` or similar
- `components/StoryViewer.tsx` — story images: `alt={story.user_name + "'s story"}`
- Any other images with empty or missing alt

### TASK 7: Remove Console.error from Production Components (MEDIUM)

Search for `console.error` in these component files and replace with a no-op or proper error tracking:

- `components/PostCommentSection.tsx`
- `components/PostSessionPrompt.tsx`
- `components/NearbyEvents.tsx`
- `components/InviteIncentiveModal.tsx`
- `components/SubscribeButton.tsx`

Replace pattern:

```typescript
// Before:
console.error('Error:', err);

// After:
// Error tracked silently — no console output in production
```

Or if there's a `logError` utility in the codebase, use that instead.

### VERIFICATION

1. Run `npx tsc --noEmit` — zero errors
2. Confirm only ONE tailwind config file exists (the .ts one)
3. Grep for `tailwind.config.js` — should not exist
4. Grep for `'unsafe-eval'` — should not exist anywhere
5. Grep for `truncate` in BottomNav.tsx — should not exist
6. Grep for `alt=""` in components/ — should have zero matches
7. Grep for `console.error` in the 5 components listed above — should have zero matches

---

## DAY 4 (Thursday): MONETIZATION — Promo Codes, Earnings, Revenue Dashboard

**Copy everything below this line into Claude Code (include global rules):**

---

You are fixing monetization issues in the Tribe v3 fitness marketplace. These fixes ensure revenue flows correctly and the app owner can see business metrics.

### TASK 1: Fix Promo Code Application at Checkout (HIGH)

**File: `app/api/payment/create/route.ts`**

The promo code validation logic exists in `lib/dal/promote.ts` (functions: `validatePromoCode`, `redeemPromoCode`). But the payment creation endpoint NEVER applies the discount.

Find the section where `amount_cents` is determined from the session price (around lines 189-228). BEFORE calculating fees, add promo code handling:

```typescript
// After fetching session and getting price_cents:
let finalAmountCents = session.price_cents;
let discountCents = 0;
let promoCodeId = null;

// Check if a promo code was provided in the request body
const { promo_code } = await request.json(); // or wherever the promo code comes from

if (promo_code) {
  // Import validatePromoCode from dal
  const { validatePromoCode } = await import('@/lib/dal/promote');
  const validation = await validatePromoCode(adminSupabase, promo_code, session.id);

  if (validation.success && validation.data) {
    const promo = validation.data;
    promoCodeId = promo.id;

    if (promo.discount_type === 'percentage') {
      discountCents = Math.round(finalAmountCents * (promo.discount_value / 100));
    } else if (promo.discount_type === 'fixed') {
      discountCents = Math.min(promo.discount_value * 100, finalAmountCents); // Don't exceed total
    } else if (promo.discount_type === 'free') {
      discountCents = finalAmountCents; // 100% off
    }

    finalAmountCents = Math.max(finalAmountCents - discountCents, 0);
  }
}

// Use finalAmountCents instead of session.price_cents for fee calculation
const fees = calculateFees(finalAmountCents);
```

Also update the payment record insertion to include the discount info:

```typescript
// In the payment INSERT, add:
discount_cents: discountCents,
promo_code_id: promoCodeId,
```

After payment creation succeeds, redeem the promo code:

```typescript
if (promoCodeId) {
  const { redeemPromoCode } = await import('@/lib/dal/promote');
  await redeemPromoCode(adminSupabase, promoCodeId, userId, paymentId);
}
```

Check if `discount_cents` and `promo_code_id` columns exist in the payments table. If not, add a TODO comment with the migration SQL:

```sql
ALTER TABLE payments ADD COLUMN IF NOT EXISTS discount_cents integer DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS promo_code_id uuid REFERENCES promo_codes(id);
```

### TASK 2: Fix Earnings Page Fee Label (HIGH)

**File: `app/earnings/page.tsx`**

Find the text that says "Platform Fees (10%)" (around line 406). Change to "Platform Fees (15%)". Search the entire file for any other references to "10%" and update to "15%". Also check the Spanish version: "Comisión de la plataforma (10%)" → "Comisión de la plataforma (15%)".

### TASK 3: Add Min/Max Price Constraints (MEDIUM)

**File: `app/create/page.tsx`**

Find the price validation in the form (around lines 153-157). Add min/max constraints:

```typescript
// After checking price > 0:
const MIN_PRICE_USD = 100; // $1.00 in cents
const MAX_PRICE_USD = 50000; // $500.00 in cents
const MIN_PRICE_COP = 5000; // 5,000 COP in cents
const MAX_PRICE_COP = 200000000; // 2,000,000 COP in cents

const minPrice = currency === 'COP' ? MIN_PRICE_COP : MIN_PRICE_USD;
const maxPrice = currency === 'COP' ? MAX_PRICE_COP : MAX_PRICE_USD;

if (priceCents < minPrice) {
  // Show error: "Minimum price is $1.00" / "Precio mínimo es $5,000 COP"
}
if (priceCents > maxPrice) {
  // Show error: "Maximum price is $500.00" / "Precio máximo es $2,000,000 COP"
}
```

Also add the same validation server-side in the payment creation route.

### TASK 4: Build Admin Revenue Dashboard (MEDIUM)

**File: `lib/dal/admin.ts`**

Add a new function to fetch revenue metrics:

```typescript
export async function fetchRevenueMetrics(supabase: SupabaseClient): Promise<
  DalResult<{
    totalRevenueCentsUSD: number;
    totalRevenueCentsCOP: number;
    totalPlatformFeesCentsUSD: number;
    totalPlatformFeesCentsCOP: number;
    totalPaymentsCount: number;
    failedPaymentsCount: number;
    thisMonthRevenueCentsUSD: number;
    thisMonthRevenueCentsCOP: number;
  }>
> {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    // Total approved payments
    const { data: allPayments } = await supabase
      .from('payments')
      .select('amount_cents, platform_fee_cents, currency, status')
      .eq('status', 'approved');

    // Failed payments count
    const { count: failedCount } = await supabase
      .from('payments')
      .select('*', { count: 'exact', head: true })
      .in('status', ['declined', 'error', 'voided']);

    // This month's payments
    const { data: monthPayments } = await supabase
      .from('payments')
      .select('amount_cents, platform_fee_cents, currency')
      .eq('status', 'approved')
      .gte('created_at', startOfMonth.toISOString());

    const metrics = {
      totalRevenueCentsUSD: 0,
      totalRevenueCentsCOP: 0,
      totalPlatformFeesCentsUSD: 0,
      totalPlatformFeesCentsCOP: 0,
      totalPaymentsCount: allPayments?.length || 0,
      failedPaymentsCount: failedCount || 0,
      thisMonthRevenueCentsUSD: 0,
      thisMonthRevenueCentsCOP: 0,
    };

    for (const p of allPayments || []) {
      if (p.currency === 'USD') {
        metrics.totalRevenueCentsUSD += p.amount_cents || 0;
        metrics.totalPlatformFeesCentsUSD += p.platform_fee_cents || 0;
      } else {
        metrics.totalRevenueCentsCOP += p.amount_cents || 0;
        metrics.totalPlatformFeesCentsCOP += p.platform_fee_cents || 0;
      }
    }

    for (const p of monthPayments || []) {
      if (p.currency === 'USD') {
        metrics.thisMonthRevenueCentsUSD += p.amount_cents || 0;
      } else {
        metrics.thisMonthRevenueCentsCOP += p.amount_cents || 0;
      }
    }

    return { success: true, data: metrics };
  } catch (error) {
    return { success: false, error: 'Failed to fetch revenue metrics' };
  }
}
```

**File: `app/admin/page.tsx`**

Add a "Revenue" section to the admin dashboard that calls `fetchRevenueMetrics()` and displays:

- Total Platform Fees (USD): $X.XX
- Total Platform Fees (COP): $X,XXX
- This Month Revenue (USD / COP)
- Total Payments: X (Y failed)

Style it with the Tribe design system (dark cards, tribe-green accents for positive numbers, red for failed payments).

### TASK 5: Fix Cron Job Timeouts (HIGH)

**File: `app/api/cron/engagement/route.ts`**

Find the loop that sends notifications serially (around lines 206-224). Replace serial HTTP requests with parallel batches:

```typescript
// Instead of: for (const user of inactiveUsers) { await fetch(...) }
// Use parallel batches:

const BATCH_SIZE = 25;
for (let i = 0; i < inactiveUsers.length; i += BATCH_SIZE) {
  const batch = inactiveUsers.slice(i, i + BATCH_SIZE);
  await Promise.allSettled(
    batch.map((user) =>
      fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/notifications/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
        body: JSON.stringify({
          user_id: user.id,
          title: 'We miss you!',
          body: 'Your training partners are waiting. Come back and train!',
          type: 're_engagement',
        }),
      }).catch((err) => console.error('Notification failed for', user.id))
    )
  );
}
```

Apply the same parallelization pattern to:

- `app/api/send-weekly-recap/route.ts`
- `app/api/cron/reminders/route.ts`
- Any other cron that loops over users and makes HTTP calls serially

### TASK 6: Lazy-Load Firebase (HIGH)

**File: Search for Firebase imports across the codebase**

Find all files that import from 'firebase' or 'firebase/app' or '@firebase/messaging'. Wrap these imports in dynamic imports that only load when running inside Capacitor:

```typescript
// Before:
import { getMessaging } from 'firebase/messaging';

// After:
let getMessaging: any = null;
if (typeof window !== 'undefined' && (window as any).Capacitor) {
  import('firebase/messaging').then((mod) => {
    getMessaging = mod.getMessaging;
  });
}
```

Or use Next.js dynamic imports where appropriate. The goal is to NOT load the 1.2MB Firebase SDK on web-only users.

### VERIFICATION

1. Run `npx tsc --noEmit` — zero errors
2. Read app/api/payment/create/route.ts — confirm promo code discount logic exists
3. Grep for "10%" in app/earnings/page.tsx — should return zero matches (all changed to 15%)
4. Read lib/dal/admin.ts — confirm fetchRevenueMetrics function exists
5. Read app/api/cron/engagement/route.ts — confirm Promise.allSettled batch pattern (no serial loop)

---

## DAY 5 (Friday): ACCOUNT SAFETY + FINAL VERIFICATION

**Copy everything below this line into Claude Code (include global rules):**

---

You are implementing safety features and running final verification on all audit fixes in Tribe v3.

### TASK 1: Implement Soft-Delete for Account Deletion (HIGH)

**File: Read the current account deletion flow** — check `app/legal/delete-account/page.tsx` and any DAL functions related to user deletion.

The current deletion likely hard-deletes user data. Replace with soft-delete:

**File: `lib/dal/users.ts`** (or wherever user deletion is handled)

```typescript
export async function softDeleteUser(supabase: SupabaseClient, userId: string): Promise<DalResult<null>> {
  try {
    // 1. Cancel all future sessions this user created
    const { data: futureSessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('creator_id', userId)
      .gte('date', new Date().toISOString())
      .in('status', ['active', 'upcoming']);

    for (const session of futureSessions || []) {
      // Use the updated cancelSession which handles refunds + notifications
      await cancelSession(supabase, session.id);
    }

    // 2. Remove user from future session participations
    const { data: futureParticipations } = await supabase
      .from('session_participants')
      .select('session_id')
      .eq('user_id', userId)
      .eq('status', 'confirmed');

    for (const p of futureParticipations || []) {
      await supabase
        .from('session_participants')
        .update({ status: 'cancelled' })
        .eq('session_id', p.session_id)
        .eq('user_id', userId);
    }

    // 3. Anonymize user profile (keep record for audit, remove PII)
    await supabase
      .from('users')
      .update({
        name: 'Deleted User',
        email: `deleted-${userId}@deleted.tribe.app`,
        avatar_url: null,
        bio: null,
        phone: null,
        location_lat: null,
        location_lng: null,
        deleted_at: new Date().toISOString(),
        is_active: false,
      })
      .eq('id', userId);

    // 4. Deactivate connections
    await supabase
      .from('connections')
      .update({ status: 'cancelled' })
      .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`);

    // 5. Sign out user
    await supabase.auth.admin.deleteUser(userId);

    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to delete account' };
  }
}
```

Update the delete account page to call this function instead of hard-deleting.

### TASK 2: Fix Challenge Progress Validation (HIGH)

**File: `lib/dal/challenges.ts`**

Find the function that reads/updates challenge progress (around lines 382-405). Add a recalculation function that computes progress from actual data:

```typescript
export async function recalculateChallengeProgress(
  supabase: SupabaseClient,
  challengeId: string,
  userId: string
): Promise<DalResult<number>> {
  try {
    const { data: challenge } = await supabase
      .from('challenges')
      .select('challenge_type, target_value, sport, start_date, end_date')
      .eq('id', challengeId)
      .single();

    if (!challenge) return { success: false, error: 'Challenge not found' };

    let progress = 0;

    if (challenge.challenge_type === 'session_count') {
      // Count ACTUAL confirmed session participations in date range
      const { count } = await supabase
        .from('session_participants')
        .select('*, sessions!inner(date, sport)', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'confirmed')
        .gte('sessions.date', challenge.start_date)
        .lte('sessions.date', challenge.end_date);
      progress = count || 0;
    } else if (challenge.challenge_type === 'sport_variety') {
      const { data: sessions } = await supabase
        .from('session_participants')
        .select('sessions!inner(sport)')
        .eq('user_id', userId)
        .eq('status', 'confirmed')
        .gte('sessions.date', challenge.start_date)
        .lte('sessions.date', challenge.end_date);
      const uniqueSports = new Set(sessions?.map((s: any) => s.sessions?.sport).filter(Boolean));
      progress = uniqueSports.size;
    }

    // Update with calculated value
    await supabase
      .from('challenge_participants')
      .update({ progress, updated_at: new Date().toISOString() })
      .eq('challenge_id', challengeId)
      .eq('user_id', userId);

    return { success: true, data: progress };
  } catch (error) {
    return { success: false, error: 'Failed to recalculate progress' };
  }
}
```

### TASK 3: Fix Location Privacy (MEDIUM)

**File: `app/api/venues/nearby/route.ts`** and any other endpoint that returns user locations

Add location fuzzing — round coordinates to ~500m precision before sending to client:

```typescript
function fuzzLocation(lat: number, lng: number, precisionKm: number = 0.5): { lat: number; lng: number } {
  // ~0.005 degrees = ~500m
  const precision = precisionKm / 111; // 1 degree ≈ 111km
  return {
    lat: Math.round(lat / precision) * precision,
    lng: Math.round(lng / precision) * precision,
  };
}
```

Apply this to user location data before returning it in API responses. Venue locations can stay precise (they're public businesses). Only fuzz USER locations in responses like training partner search, nearby athletes, etc.

### TASK 4: Fix /api/generate-calendar Auth (MEDIUM)

**File: `app/api/generate-calendar/route.ts`** (or wherever the calendar generation endpoint is)

This endpoint is publicly accessible. Add an auth check:

```typescript
// At the top of the handler:
const {
  data: { user },
  error: authError,
} = await supabase.auth.getUser();
if (authError || !user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// Optionally verify user is a participant of the session
const { data: participant } = await supabase
  .from('session_participants')
  .select('id')
  .eq('session_id', sessionId)
  .eq('user_id', user.id)
  .maybeSingle();

// Allow if participant OR if session is public
```

Also update `middleware.ts` to remove `/api/generate-calendar` from publicApiPaths.

### TASK 5: COMPREHENSIVE VERIFICATION — Run ALL Checks

This is the final verification. Run every check below and report the results:

```bash
# 1. TypeScript compilation
npx tsc --noEmit

# 2. Security checks
grep -r "unsafe-eval" next.config.ts
grep -r "unsafe-inline" next.config.ts  # Should only be in style-src if needed
grep -r "unoptimized: true" next.config.ts  # Should not exist

# 3. UI checks
ls tailwind.config.*  # Should only show .ts
grep -r 'alt=""' components/  # Should have zero matches
grep -r "console.error" components/PostCommentSection.tsx components/PostSessionPrompt.tsx components/NearbyEvents.tsx components/InviteIncentiveModal.tsx components/SubscribeButton.tsx  # Should have zero matches
grep -r "truncate" components/BottomNav.tsx  # Should not exist on label span

# 4. Logic checks — read and confirm these patterns exist:
# - Webhook files have participant insertion after payment approval
# - Webhook files have idempotency checks
# - connections.ts has block check before sendConnectionRequest
# - sessions.ts cancelSession has refund + notification logic
# - challenges.ts has recalculateChallengeProgress function

# 5. Monetization checks
grep -r "10%" app/earnings/page.tsx  # Should have zero matches (all 15%)
# - payment/create/route.ts has promo code discount logic
# - admin.ts has fetchRevenueMetrics function

# 6. Performance checks
# - engagement cron uses Promise.allSettled (no serial loop)
# - Firebase imports are dynamic/conditional
```

Report ALL results. If any check fails, fix it before considering the day complete.

### TASK 6: Generate Summary of All Changes

After all verification passes, create a file `AUDIT_FIX_CHANGELOG.md` in the project root with a summary of every change made across all 5 days. Include:

- File changed
- What was changed
- Which audit item it addressed
- Status (fixed / partially fixed / TODO remaining)

---

## AL'S MANUAL TASKS (Do alongside Claude Code work)

These are things Claude Code CANNOT do for you:

### Monday (while Day 1 runs):

- [ ] Go to Supabase Dashboard → Settings → API → rotate the service role key
- [ ] Go to Stripe Dashboard → Developers → API Keys → roll the keys
- [ ] Go to Wompi Dashboard → regenerate private key and events secret
- [ ] Go to Firebase Console → Project Settings → Service Accounts → generate new private key
- [ ] Go to Resend Dashboard → API Keys → create new key, delete old one
- [ ] Generate new CRON_SECRET: run `openssl rand -hex 32` in terminal
- [ ] Generate new VAPID keys if needed
- [ ] Update ALL new values in Vercel → Settings → Environment Variables
- [ ] Redeploy on Vercel after updating env vars
- [ ] Verify .env.local is in .gitignore (run: `git check-ignore .env.local`)
- [ ] Check git history for .env.local exposure: `git log --all --full-history -- .env.local`
- [ ] If found in history, run: `git filter-repo --path .env.local --invert-paths` (or use BFG Repo-Cleaner)

### Tuesday:

- [ ] In Supabase SQL Editor, create the `join_session` RPC (from Day 2 Task 1)
- [ ] In Supabase SQL Editor, add UNIQUE constraint: `ALTER TABLE session_participants ADD CONSTRAINT IF NOT EXISTS unique_session_user UNIQUE (session_id, user_id);`
- [ ] Create rate_limits table if Day 1 Task 6 used the Supabase approach

### Wednesday:

- [ ] Test the app on your phone — verify BottomNav labels all show fully
- [ ] Check streak banner — verify no duplicate day labels
- [ ] Check filter dropdown — verify no emojis

### Thursday:

- [ ] Set up Twilio account (sign up, get SID + Auth Token + phone number)
- [ ] Add Twilio env vars to Vercel
- [ ] Set up Eventbrite API key if ready
- [ ] Add EVENTBRITE_API_KEY to Vercel

### Friday:

- [ ] Full app walkthrough on phone — test every flow
- [ ] Create a paid test session, pay for it, verify you're added as participant
- [ ] Cancel a session, verify notification appears
- [ ] Test promo code flow if possible
- [ ] Check admin page for revenue metrics
- [ ] Push final commit and redeploy
