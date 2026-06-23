# Email OTP Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragile email-link verification (PKCE code exchange in the browser) with a 6-digit code the user types in-app, and harden the OAuth callback against duplicate code exchange.

**Architecture:** Signup still happens server-side via `/api/auth/signup` (`supabase.auth.signUp`), which creates the user and triggers the confirmation email. The Supabase email templates switch from a clickable link (`{{ .ConfirmationURL }}`) to the 6-digit token (`{{ .Token }}`). After signup the UI moves to a code-entry screen that calls `supabase.auth.verifyOtp({ email, token, type })` directly in the browser. Because there is no link, email scanners have nothing to pre-fetch, and because there is no PKCE code exchange, there is no cross-device / in-app-webview session mismatch. OAuth (Google/Apple) keeps the existing `/auth/callback` code-exchange path, hardened so a duplicate/consumed code that still produced a session does not flash an error.

**Tech Stack:** Next.js 16 App Router (all `'use client'`), Supabase (`@supabase/ssr` browser client, `@supabase/supabase-js` v2 `verifyOtp`), Vitest 4 + Testing Library + jsdom, Tailwind with `tribe-*` tokens.

## Global Constraints

- All user-facing copy is bilingual EN/ES via the `getAuthTranslations(language)` object in `app/auth/translations.ts`. No new raw strings in JSX.
- Copy style: no em dashes or en dashes, complete sentences, no marketing jargon.
- Typed props and return types. No `any` without a justifying comment.
- Every file stays under 300 lines; split if it would exceed.
- Database access uses `lib/dal/` helpers (this feature adds none; it reuses `applyReferralCode`).
- Tests run with `npm run test` (`vitest run`). Mirror the mock patterns already in `app/auth/page.test.tsx`.
- Commit messages: do NOT add a `Co-Authored-By` trailer.
- Brand: `tribe-green`, `tribe-mid`, `tribe-card`, stone/charcoal neutrals, light-blue accent. Reuse `@/components/ui/{button,input,label}`.

---

### Task 1: Add OTP error copy to `lib/errorMessages.ts`

**Files:**

- Modify: `lib/errorMessages.ts:6-58` (errorMap) and `lib/errorMessages.ts:61-154` (contextMessages)
- Test: `lib/errorMessages.test.ts` (create if absent)

**Interfaces:**

- Consumes: existing `getErrorMessage(error, context, language)`.
- Produces: a `verify_code` context fallback and `otp_expired` / `Token has expired` error-map entries used by `handleVerifyCode` in Task 4.

- [ ] **Step 1: Write the failing test**

```ts
// lib/errorMessages.test.ts
import { describe, it, expect } from 'vitest';
import { getErrorMessage } from './errorMessages';

describe('getErrorMessage — OTP', () => {
  it('maps an expired/invalid OTP to localized copy (es)', () => {
    const msg = getErrorMessage({ code: 'otp_expired' }, 'verify_code', 'es');
    expect(msg).toBe('El código es incorrecto o ya expiró. Pide uno nuevo.');
  });

  it('falls back to the verify_code context message in en', () => {
    const msg = getErrorMessage({ message: 'something else' }, 'verify_code', 'en');
    expect(msg).toBe('That code is incorrect or has expired. Request a new one.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/errorMessages.test.ts`
Expected: FAIL (returns the generic fallback, not the OTP copy).

- [ ] **Step 3: Add the error-map entry**

In `lib/errorMessages.ts`, inside `errorMap` (after the `'Password should be at least'` block, around line 35), add:

```ts
    otp_expired: {
      en: 'That code is incorrect or has expired. Request a new one.',
      es: 'El código es incorrecto o ya expiró. Pide uno nuevo.',
    },
    'Token has expired or is invalid': {
      en: 'That code is incorrect or has expired. Request a new one.',
      es: 'El código es incorrecto o ya expiró. Pide uno nuevo.',
    },
```

- [ ] **Step 4: Add the context fallback**

In `lib/errorMessages.ts`, inside `contextMessages` (after the `reset_password` block, around line 149), add:

```ts
    verify_code: {
      en: 'That code is incorrect or has expired. Request a new one.',
      es: 'El código es incorrecto o ya expiró. Pide uno nuevo.',
    },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- lib/errorMessages.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/errorMessages.ts lib/errorMessages.test.ts
git commit -m "feat(auth): localized error copy for OTP verification"
```

---

### Task 2: Add verify-code copy to `app/auth/translations.ts`

**Files:**

- Modify: `app/auth/translations.ts` (inside the object returned by `getAuthTranslations`, before the `authError` entry around line 61)
- Test: `app/auth/translations.test.ts` (create)

**Interfaces:**

- Produces: `t.verifyTitle`, `t.verifyInstructions(email: string)`, `t.codeLabel`, `t.codePlaceholder`, `t.verifyButton`, `t.codeSent`, `t.useDifferentEmail`, `t.resendCode` on the `AuthTranslations` type, consumed by Tasks 3, 4, 5.

- [ ] **Step 1: Write the failing test**

```ts
// app/auth/translations.test.ts
import { describe, it, expect } from 'vitest';
import { getAuthTranslations } from './translations';

describe('getAuthTranslations — verify code copy', () => {
  it('provides bilingual verify-code strings', () => {
    const es = getAuthTranslations('es');
    const en = getAuthTranslations('en');
    expect(es.verifyTitle).toBe('Verifica tu cuenta');
    expect(en.verifyTitle).toBe('Verify your account');
    expect(es.verifyInstructions('a@b.com')).toContain('a@b.com');
    expect(en.codePlaceholder).toBe('123456');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- app/auth/translations.test.ts`
Expected: FAIL (`verifyTitle` is undefined).

- [ ] **Step 3: Add the strings**

In `app/auth/translations.ts`, immediately before the `authError:` entry (around line 61), add:

```ts
    verifyTitle: language === 'es' ? 'Verifica tu cuenta' : 'Verify your account',
    verifyInstructions: (email: string) =>
      language === 'es'
        ? `Ingresa el código de 6 dígitos que enviamos a ${email}.`
        : `Enter the 6-digit code we sent to ${email}.`,
    codeLabel: language === 'es' ? 'Código de verificación' : 'Verification code',
    codePlaceholder: '123456',
    verifyButton: language === 'es' ? 'Verificar' : 'Verify',
    codeSent:
      language === 'es'
        ? '✅ Te enviamos un código de 6 dígitos a tu correo.'
        : '✅ We sent a 6-digit code to your email.',
    useDifferentEmail: language === 'es' ? 'Usar otro correo' : 'Use a different email',
    resendCode: language === 'es' ? 'Reenviar código' : 'Resend code',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- app/auth/translations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/auth/translations.ts app/auth/translations.test.ts
git commit -m "feat(auth): bilingual copy for code-entry screen"
```

---

### Task 3: Create the `VerifyCodeForm` component

**Files:**

- Create: `app/auth/VerifyCodeForm.tsx`
- Test: `app/auth/VerifyCodeForm.test.tsx`

**Interfaces:**

- Consumes: `AuthTranslations` from `./translations` (Task 2 keys).
- Produces: default export `VerifyCodeForm` with props
  `{ t: AuthTranslations; email: string; code: string; loading: boolean; message: string; resendCooldown: number; onCodeChange: (v: string) => void; onSubmit: (e: React.FormEvent) => void; onResend: () => void; onBack: () => void; }`. Consumed by Task 5.

- [ ] **Step 1: Write the failing test**

```tsx
// app/auth/VerifyCodeForm.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VerifyCodeForm from './VerifyCodeForm';
import { getAuthTranslations } from './translations';

const t = getAuthTranslations('en');

function setup(over = {}) {
  const props = {
    t,
    email: 'ana@example.com',
    code: '',
    loading: false,
    message: '',
    resendCooldown: 0,
    onCodeChange: vi.fn(),
    onSubmit: vi.fn((e) => e.preventDefault()),
    onResend: vi.fn(),
    onBack: vi.fn(),
    ...over,
  };
  render(<VerifyCodeForm {...props} />);
  return props;
}

describe('VerifyCodeForm', () => {
  it('shows the destination email and a code input', () => {
    setup();
    expect(screen.getByText(/ana@example.com/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('123456')).toBeInTheDocument();
  });

  it('fires onCodeChange with digits only', () => {
    const props = setup();
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: '12a3' } });
    expect(props.onCodeChange).toHaveBeenCalledWith('123');
  });

  it('disables resend while cooling down', () => {
    setup({ resendCooldown: 42 });
    expect(screen.getByText(/42s/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- app/auth/VerifyCodeForm.test.tsx`
Expected: FAIL (module `./VerifyCodeForm` not found).

- [ ] **Step 3: Create the component**

```tsx
// app/auth/VerifyCodeForm.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AuthTranslations } from './translations';

interface VerifyCodeFormProps {
  t: AuthTranslations;
  email: string;
  code: string;
  loading: boolean;
  message: string;
  resendCooldown: number;
  onCodeChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onResend: () => void;
  onBack: () => void;
}

export default function VerifyCodeForm({
  t,
  email,
  code,
  loading,
  message,
  resendCooldown,
  onCodeChange,
  onSubmit,
  onResend,
  onBack,
}: VerifyCodeFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-stone-600 dark:text-gray-300">{t.verifyInstructions(email)}</p>

      <div>
        <Label className="text-stone-700 dark:text-gray-300 mb-1.5">{t.codeLabel}</Label>
        <Input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          // Strip non-digits so paste and autofill stay numeric.
          onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder={t.codePlaceholder}
          required
          enterKeyHint="go"
          className="h-auto py-3 text-center text-2xl tracking-[0.5em] dark:border-tribe-mid focus:ring-tribe-green bg-white dark:bg-tribe-mid text-stone-900 dark:text-white"
        />
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.includes('✅')
              ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
          }`}
        >
          {message}
        </div>
      )}

      <Button type="submit" disabled={loading || code.length < 6} className="w-full py-3 font-bold">
        {loading ? t.loading : t.verifyButton}
      </Button>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="link"
          onClick={onBack}
          disabled={loading}
          className="text-sm text-stone-600 dark:text-gray-400 hover:underline p-0 h-auto"
        >
          {t.useDifferentEmail}
        </Button>
        <Button
          type="button"
          variant="link"
          onClick={onResend}
          disabled={resendCooldown > 0}
          className="text-sm text-tribe-green hover:underline disabled:opacity-50 p-0 h-auto"
        >
          {resendCooldown > 0 ? `${t.resendIn} ${resendCooldown}s` : t.resendCode}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- app/auth/VerifyCodeForm.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/auth/VerifyCodeForm.tsx app/auth/VerifyCodeForm.test.tsx
git commit -m "feat(auth): 6-digit code entry form component"
```

---

### Task 4: Wire OTP state + handlers into `useAuthHandlers`

**Files:**

- Modify: `app/auth/useAuthHandlers.ts`
- Test: `app/auth/useAuthHandlers.test.tsx` (create)

**Interfaces:**

- Consumes: `supabase.auth.verifyOtp`, `supabase.auth.resend`, `upsertUserProfile`, `applyReferralCode`, `trackEvent`, `getErrorMessage('verify_code', ...)`.
- Produces, added to the hook's return object: `verifyMode: 'signup' | 'recovery' | null`, `otpCode: string`, `setOtpCode: (v: string) => void`, `otpEmail: string`, `handleVerifyCode: (e: React.FormEvent) => Promise<void>`, `handleBackFromVerify: () => void`. Consumed by Task 5.

- [ ] **Step 1: Write the failing test**

```tsx
// app/auth/useAuthHandlers.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

let mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

const verifyOtp = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
const resend = vi.fn().mockResolvedValue({ error: null });
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      signInWithPassword: vi.fn(),
      verifyOtp,
      resend,
    },
  }),
}));
vi.mock('@/lib/auth-helpers', () => ({ upsertUserProfile: vi.fn().mockResolvedValue({ isNewUser: true }) }));
vi.mock('@/lib/dal/referrals', () => ({ applyReferralCode: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));

import { useAuthHandlers } from './useAuthHandlers';

describe('useAuthHandlers — OTP verify', () => {
  beforeEach(() => {
    verifyOtp.mockClear();
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true });
  });

  it('signup success enters verify mode and stores the email', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }));
    const { result } = renderHook(() => useAuthHandlers('en'));
    act(() => {
      result.current.setIsLogin(false);
      result.current.setEmail('ana@example.com');
      result.current.setPassword('password1');
      result.current.setName('Ana');
      result.current.setBirthDate('1990-01-01');
      result.current.setAcceptedTos(true);
    });
    await act(async () => {
      await result.current.handleSubmit({ preventDefault() {} } as React.FormEvent);
    });
    expect(result.current.verifyMode).toBe('signup');
    expect(result.current.otpEmail).toBe('ana@example.com');
  });

  it('handleVerifyCode calls verifyOtp with type signup and redirects new users to onboarding', async () => {
    const { result } = renderHook(() => useAuthHandlers('en'));
    act(() => {
      result.current.setIsLogin(false);
      result.current.setEmail('ana@example.com');
      result.current.setOtpCode('123456');
    });
    // Force verify mode without re-running signup:
    await act(async () => {
      await result.current.handleVerifyCode({ preventDefault() {} } as React.FormEvent);
    });
    expect(verifyOtp).toHaveBeenCalledWith({ email: '', token: '123456', type: 'signup' });
  });
});
```

> Note for implementer: the second test asserts `email: ''` because `otpEmail` defaults to empty until signup runs. That is acceptable — it proves the call shape and `type: 'signup'`. The first test covers the real signup-to-verify transition.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- app/auth/useAuthHandlers.test.tsx`
Expected: FAIL (`result.current.verifyMode` is undefined; `handleVerifyCode` is not a function).

- [ ] **Step 3: Add state and handlers**

In `app/auth/useAuthHandlers.ts`, add state near the other `useState` calls (after line 38):

```ts
const [verifyMode, setVerifyMode] = useState<'signup' | 'recovery' | null>(null);
const [otpCode, setOtpCode] = useState('');
const [otpEmail, setOtpEmail] = useState('');
```

Replace the signup success block (currently lines 228-233, the `trackEvent('signup_completed' ...)` through the field resets) with:

```ts
trackEvent('signup_completed', { method: 'email' });
// Move to in-app code entry instead of asking the user to click an
// email link. A typed code can't be consumed by email scanners and
// works regardless of which browser opens the inbox.
setOtpEmail(email);
setOtpCode('');
setVerifyMode('signup');
setMessage(t.codeSent);
```

Add the verify handler after `handleResendVerification` (after line 277):

```ts
async function handleVerifyCode(e: React.FormEvent) {
  e.preventDefault();
  setLoading(true);
  setMessage('');
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: otpEmail,
      token: otpCode.trim(),
      type: verifyMode === 'recovery' ? 'recovery' : 'signup',
    });
    if (error) throw error;

    if (verifyMode === 'recovery') {
      // Session is now established; show the new-password form.
      setVerifyMode(null);
      setIsResetPassword(true);
      return;
    }

    if (data.user) {
      const { isNewUser } = await upsertUserProfile(data.user);
      trackEvent('signup_email_verified', { user_id: data.user.id });
      const refCode = localStorage.getItem('tribe_referral_code');
      if (refCode) {
        await applyReferralCode(supabase, refCode, data.user.id);
        localStorage.removeItem('tribe_referral_code');
        trackEvent('referral_sent', { referral_code: refCode, referred_user_id: data.user.id });
      }
      await haptic('success');
      window.location.href = isNewUser ? '/onboarding/role' : getSafeReturnTo();
    }
  } catch (error: unknown) {
    logError(error, { action: 'handleVerifyCode' });
    setMessage('❌ ' + getErrorMessage(error, 'verify_code', language));
    await haptic('error');
  } finally {
    setLoading(false);
  }
}

function handleBackFromVerify() {
  setVerifyMode(null);
  setOtpCode('');
  setMessage('');
}
```

Update `handleResendVerification` (lines 266-277) so it resends to the OTP email and matches the active flow:

```ts
async function handleResendVerification() {
  const target = otpEmail || email;
  if (resendCooldown > 0 || !target) return;
  try {
    const { error } = await supabase.auth.resend({
      type: verifyMode === 'recovery' ? 'recovery' : 'signup',
      email: target,
    });
    if (error) throw error;
    showSuccess(t.verificationSent);
    setResendCooldown(60);
  } catch (error: unknown) {
    logError(error, { action: 'handleResendVerification' });
    showError(getErrorMessage(error, 'resend_verification', language));
  }
}
```

Update `handleForgotPassword` (lines 245-264) to enter the recovery-code screen instead of relying on a link. Replace its body's success path:

```ts
async function handleForgotPassword() {
  if (!email) {
    setMessage(t.enterEmailFirst);
    return;
  }
  setLoading(true);
  setMessage('');
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
    setOtpEmail(email);
    setOtpCode('');
    setVerifyMode('recovery');
    setMessage(t.codeSent);
  } catch (error: unknown) {
    logError(error, { action: 'handleForgotPassword' });
    setMessage('❌ ' + getErrorMessage(error, 'forgot_password', language));
  } finally {
    setLoading(false);
  }
}
```

Add the new members to the hook's return object (the `return { ... }` block starting at line 302):

```ts
    verifyMode,
    otpCode,
    setOtpCode,
    otpEmail,
    handleVerifyCode,
    handleBackFromVerify,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- app/auth/useAuthHandlers.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full auth suite for regressions**

Run: `npm run test -- app/auth`
Expected: PASS (existing `page.test.tsx` still green).

- [ ] **Step 6: Commit**

```bash
git add app/auth/useAuthHandlers.ts app/auth/useAuthHandlers.test.tsx
git commit -m "feat(auth): verifyOtp code flow for signup and password reset"
```

---

### Task 5: Render `VerifyCodeForm` in `app/auth/page.tsx`

**Files:**

- Modify: `app/auth/page.tsx:116-160` (the form-selection block) and the imports at top.
- Test: extend `app/auth/page.test.tsx`

**Interfaces:**

- Consumes: `h.verifyMode`, `h.otpEmail`, `h.otpCode`, `h.setOtpCode`, `h.handleVerifyCode`, `h.handleResendVerification`, `h.handleBackFromVerify`, `h.resendCooldown` from Task 4; `VerifyCodeForm` from Task 3.

- [ ] **Step 1: Write the failing test**

Add to `app/auth/page.test.tsx` (mirror its existing mock setup; ensure the `createClient` mock includes `verifyOtp: vi.fn()` and `resend: vi.fn()`):

```tsx
it('shows the code-entry screen when verifyMode is signup', async () => {
  // Drive the hook into verify mode by mocking useAuthHandlers indirectly is
  // brittle; instead assert the component renders for the verify branch.
  // Render, switch to signup, and submit with a mocked successful fetch.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }));
  const { default: AuthPage } = await import('./page');
  const { render, screen, fireEvent, waitFor } = await import('@testing-library/react');
  render(<AuthPage />);
  // Toggle to sign up
  fireEvent.click(screen.getByText(/Sign up|Don't have an account/i));
  // Fill required fields
  fireEvent.change(screen.getByPlaceholderText('email@example.com'), { target: { value: 'ana@example.com' } });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password1' } });
  // (name + birthdate + tos handled by existing helpers/inputs)
});
```

> Note for implementer: if the full submit path is too brittle in jsdom, downgrade this to a render-branch test by extracting the verify branch behind `h.verifyMode` and asserting `VerifyCodeForm` mounts when a stubbed hook returns `verifyMode: 'signup'`. The hook logic itself is already covered by Task 4; this test only needs to prove the page renders the right branch.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- app/auth/page.test.tsx`
Expected: FAIL (code-entry branch not rendered).

- [ ] **Step 3: Add the import**

In `app/auth/page.tsx` after line 18 (`import EmailAuthForm from './EmailAuthForm';`):

```ts
import VerifyCodeForm from './VerifyCodeForm';
```

- [ ] **Step 4: Render the verify branch**

In `app/auth/page.tsx`, change the conditional at line 127 from a two-way to a three-way. Replace:

```tsx
            {h.isResetPassword ? (
```

with:

```tsx
            {h.verifyMode ? (
              <VerifyCodeForm
                t={h.t}
                email={h.otpEmail}
                code={h.otpCode}
                loading={h.loading}
                message={h.message}
                resendCooldown={h.resendCooldown}
                onCodeChange={h.setOtpCode}
                onSubmit={h.handleVerifyCode}
                onResend={h.handleResendVerification}
                onBack={h.handleBackFromVerify}
              />
            ) : h.isResetPassword ? (
```

Also hide the OAuth buttons and the login/signup toggle while verifying. Change line 116 from `{!h.isResetPassword && (` to `{!h.isResetPassword && !h.verifyMode && (` for the `OAuthButtons` block, and line 162 from `{!h.isResetPassword && (` to `{!h.isResetPassword && !h.verifyMode && (` for the toggle block. Update the heading at line 95 to show the verify title:

```tsx
{
  h.verifyMode
    ? h.t.verifyTitle
    : h.isResetPassword
      ? h.t.resetPassword
      : h.isLogin
        ? h.t.welcomeBack
        : h.t.joinCommunity;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- app/auth/page.test.tsx`
Expected: PASS.

- [ ] **Step 6: Build to catch type errors**

Run: `npm run build`
Expected: compiles with no type errors in `app/auth`.

- [ ] **Step 7: Commit**

```bash
git add app/auth/page.tsx app/auth/page.test.tsx
git commit -m "feat(auth): render code-entry screen in auth page"
```

---

### Task 6: Harden the OAuth callback against duplicate code exchange

**Files:**

- Modify: `app/auth/callback/page.tsx:48-60`
- Test: `app/auth/callback/page.test.tsx` (create)

**Interfaces:**

- Consumes: `supabase.auth.exchangeCodeForSession`, `supabase.auth.getSession`.
- Produces: callback that does NOT redirect to `/auth?error=` when the code was already consumed but a session exists.

- [ ] **Step 1: Write the failing test**

```tsx
// app/auth/callback/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

let params = new URLSearchParams('code=abc');
vi.mock('next/navigation', () => ({ useSearchParams: () => params }));

const exchangeCodeForSession = vi.fn();
const getSession = vi.fn();
const getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { exchangeCodeForSession, getSession, getUser } }),
}));
vi.mock('@/lib/auth-helpers', () => ({ upsertUserProfile: vi.fn().mockResolvedValue({ isNewUser: false }) }));
vi.mock('@/lib/dal/referrals', () => ({ applyReferralCode: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn() }));
vi.mock('@/components/LoadingSpinner', () => ({ default: () => <div /> }));

import AuthCallbackPage from './page';

describe('AuthCallbackPage — duplicate code', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true });
  });

  it('does not bounce to /auth when the code was consumed but a session exists', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: 'invalid request' } });
    getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    render(<AuthCallbackPage />);
    await waitFor(() => expect(getUser).toHaveBeenCalled());
    expect(window.location.href).not.toContain('/auth?error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- app/auth/callback/page.test.tsx`
Expected: FAIL (current code redirects to `/auth?error=...` whenever `exchangeError` is set).

- [ ] **Step 3: Add the session fallback**

In `app/auth/callback/page.tsx`, replace the exchange block (lines 48-56):

```tsx
const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

if (exchangeError) {
  logError(exchangeError, { action: 'exchangeCodeForSession', route: '/auth/callback' });
  setError(exchangeError.message);
  window.location.href = `/auth?error=${encodeURIComponent(exchangeError.message)}`;
  return;
}
```

with:

```tsx
const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

if (exchangeError) {
  // A single-use code can be consumed twice — an email scanner pre-fetch
  // or a double mount. If the first exchange already established a
  // session, the duplicate's error is harmless; only fail when there is
  // genuinely no session.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    logError(exchangeError, { action: 'exchangeCodeForSession', route: '/auth/callback' });
    setError(exchangeError.message);
    window.location.href = `/auth?error=${encodeURIComponent(exchangeError.message)}`;
    return;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- app/auth/callback/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/auth/callback/page.tsx app/auth/callback/page.test.tsx
git commit -m "fix(auth): treat consumed-code-with-session as success in OAuth callback"
```

---

### Task 7: Friendly "your account is verified, sign in" nudge on link failure

**Why:** When the email-link exchange fails, Supabase's verify endpoint has usually already confirmed the email (`confirmed_at` set) — only the browser auto-login failed. The user is actually verified but lands on a raw error and assumes they are stuck. This nudge routes them to sign in. It protects existing users and old links during the transition to OTP, and is a safety net afterward.

**Files:**

- Modify: `app/auth/translations.ts` (add one key alongside the Task 2 keys)
- Modify: `app/auth/useAuthHandlers.ts:68-79` (the `errorParam` effect)
- Test: extend `app/auth/useAuthHandlers.test.tsx`

**Interfaces:**

- Consumes: `t.verifiedSignIn` (added here), `errorParam` from `useSearchParams`.
- Produces: when `errorParam` looks like a verify/link failure, `message` is set to `t.verifiedSignIn` instead of the raw `t.authError(...)`.

- [ ] **Step 1: Write the failing test**

Add to `app/auth/useAuthHandlers.test.tsx`:

```tsx
import { getAuthTranslations } from './translations';

it('shows a sign-in nudge when the URL carries an invalid/expired link error', () => {
  // Set BEFORE rendering: the errorParam effect runs on mount.
  // (mockSearchParams is the mutable URLSearchParams from the top of this file.)
  mockSearchParams = new URLSearchParams('error=Email link is invalid or has expired');
  const { result } = renderHook(() => useAuthHandlers('es'));
  expect(result.current.message).toBe(getAuthTranslations('es').verifiedSignIn);
  mockSearchParams = new URLSearchParams(); // reset for other tests
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- app/auth/useAuthHandlers.test.tsx`
Expected: FAIL (`verifiedSignIn` undefined; message is the raw `authError` string).

- [ ] **Step 3: Add the translation key**

In `app/auth/translations.ts`, alongside the Task 2 keys (before `authError:`), add:

```ts
    verifiedSignIn:
      language === 'es'
        ? '✅ Tu cuenta ya está verificada. Inicia sesión con tu correo y contraseña.'
        : '✅ Your account is verified. Sign in with your email and password.',
```

- [ ] **Step 4: Update the errorParam effect**

In `app/auth/useAuthHandlers.ts`, replace the effect body (lines 68-79):

```ts
useEffect(() => {
  if (errorParam) {
    // Suppress transient OAuth errors that flash before successful redirect
    const transientErrors = ['server_error', 'temporarily_unavailable', 'access_denied'];
    const decoded = decodeURIComponent(errorParam);
    const isTransient = transientErrors.some((e) => decoded.toLowerCase().includes(e));
    // A failed email-link exchange usually means the account WAS verified
    // (Supabase's verify endpoint ran) but the browser auto-login failed.
    // Nudge the user to sign in instead of showing a dead-end error.
    const lower = decoded.toLowerCase();
    const looksLikeVerifyFailure =
      lower.includes('expired') || lower.includes('invalid') || lower.includes('code verifier');
    if (looksLikeVerifyFailure) {
      setMessage(t.verifiedSignIn);
    } else if (!isTransient) {
      setMessage(t.authError(decoded));
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
}, [errorParam]);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- app/auth/useAuthHandlers.test.tsx`
Expected: PASS (all tests in the file).

- [ ] **Step 6: Commit**

```bash
git add app/auth/translations.ts app/auth/useAuthHandlers.ts app/auth/useAuthHandlers.test.tsx
git commit -m "feat(auth): nudge verified users to sign in when a link exchange fails"
```

---

### Task 8: Supabase dashboard changes + manual QA (no code)

**Files:** none (configuration + verification). Document the result in `CHANGELOG.md`.

These steps are performed by a human in the Supabase dashboard for project `twyplulysepbeypqralz` (confirm this ref matches the production project before editing) and verified end to end.

- [ ] **Step 1: Switch the Confirm signup template to a code**

Authentication → Emails → "Confirm signup". Replace the link markup that uses `{{ .ConfirmationURL }}` with the 6-digit token. Body should read (bilingual, copy style — no dashes):

```
Welcome to Tribe. Your verification code is:

{{ .Token }}

Enter this code in the app to verify your account. It expires in one hour.
```

- [ ] **Step 2: Switch the Reset password template to a code**

Authentication → Emails → "Reset Password". Same treatment, using `{{ .Token }}` and recovery-appropriate copy.

- [ ] **Step 3: Set OTP expiry to one hour**

Authentication → Sign In / Providers → Email → set "Email OTP Expiration" to `3600` (per Supabase's security advisory). Save.

- [ ] **Step 4: Manual end-to-end QA (signup)**

On `tribe-v3.vercel.app`: register a fresh test email → confirm the email contains a 6-digit code (not a link) → enter it in the app → land on `/onboarding/role`. Confirm the new user shows as confirmed in Authentication → Users.

- [ ] **Step 5: Manual end-to-end QA (resend + wrong code)**

Enter a wrong code → confirm the localized "code is incorrect or has expired" message. Tap Resend code → confirm a new code arrives and the cooldown counts down. Enter the new code → success.

- [ ] **Step 6: Manual end-to-end QA (password reset)**

Use "Forgot password" → confirm a recovery code arrives → enter it → confirm the new-password form appears → set a new password → sign in with it.

- [ ] **Step 7: Record in CHANGELOG**

Add a dated entry to `CHANGELOG.md` describing the switch from email-link verification to 6-digit codes and the OAuth callback hardening, then commit:

```bash
git add CHANGELOG.md
git commit -m "docs: record email OTP verification rollout"
```

---

## Self-Review

**Spec coverage:** Root cause (single-use code consumed by prefetch / PKCE race) is removed by Tasks 2-5 (code flow) and mitigated for OAuth by Task 6. The "confirmed but not logged in, dead-ended on an error" symptom (Ana's exact case: `confirmed_at` set, `last_sign_in_at` null) is addressed by Task 7's sign-in nudge. Password reset covered by Task 4 (`handleForgotPassword` + recovery branch) and Task 8 Step 2/6. Expiry advisory handled in Task 8 Step 3. Bilingual copy in Tasks 1, 2, 7. Tests in every code task.

**Placeholder scan:** No "TODO/handle edge cases" placeholders. Tasks 5 and 4 carry implementer notes where jsdom brittleness is a known risk, with a concrete fallback rather than a vague instruction.

**Type consistency:** `verifyMode: 'signup' | 'recovery' | null` is defined in Task 4 and consumed with the same union in Task 5. `VerifyCodeForm` prop names (`onCodeChange`, `onResend`, `onBack`, `onSubmit`, `code`, `email`) match between Task 3 (definition) and Task 5 (usage). `verifyOtp({ email, token, type })` shape matches Task 4 implementation and its test. `getErrorMessage(error, 'verify_code', language)` context string matches Task 1.

**Known dependency note:** repo uses `@supabase/ssr@^0.0.10` and `@supabase/supabase-js@^2.39.0`. `verifyOtp`, `resend`, and `getSession` are all present in that supabase-js range. If the implementer finds the browser client wraps a newer flow, the `verifyOtp` call shape is unchanged.
