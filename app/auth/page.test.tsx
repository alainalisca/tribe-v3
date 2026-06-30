import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { getAuthTranslations } from './translations';

// Must mock before importing the component
const mockReplace = vi.fn();
const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const mockGetUser = vi.fn().mockResolvedValue({ data: { user: null } });

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { user: { id: '123' } }, error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      verifyOtp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      resend: vi.fn().mockResolvedValue({ error: null }),
    },
  }),
}));

let mockLanguage = 'en';
vi.mock('@/lib/LanguageContext', () => ({
  useLanguage: () => ({
    language: mockLanguage,
    t: (key: string) => key,
  }),
}));

vi.mock('@/components/LanguageToggle', () => ({
  default: () => <div data-testid="lang-toggle" />,
}));

vi.mock('@/lib/auth-helpers', () => ({
  upsertUserProfile: vi.fn().mockResolvedValue({ isNewUser: false }),
}));

vi.mock('@/lib/toast', () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock('@/lib/errorMessages', () => ({
  getErrorMessage: vi.fn(() => 'Error occurred'),
}));

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'web', isNativePlatform: () => false },
}));

// ---------------------------------------------------------------------------
// Controlled mock for useAuthHandlers — lets individual tests override
// verifyMode (and any other field) without rerendering a full hook.
// The t object is derived from getAuthTranslations so bilingual tests work.
// ---------------------------------------------------------------------------
let mockVerifyMode: 'signup' | 'recovery' | null = null;
let mockIsLogin = true;
let mockIsResetPassword = false;

vi.mock('./useAuthHandlers', () => ({
  useAuthHandlers: (language: 'en' | 'es') => {
    const t = getAuthTranslations(language);
    return {
      t,
      isLogin: mockIsLogin,
      setIsLogin: (v: boolean) => {
        mockIsLogin = v;
      },
      isResetPassword: mockIsResetPassword,
      checkingAuth: false,
      email: '',
      setEmail: vi.fn(),
      password: '',
      setPassword: vi.fn(),
      confirmPassword: '',
      setConfirmPassword: vi.fn(),
      name: '',
      setName: vi.fn(),
      birthDate: '',
      setBirthDate: vi.fn(),
      acceptedTos: false,
      setAcceptedTos: vi.fn(),
      loading: false,
      appleLoading: false,
      googleLoading: false,
      message: '',
      setMessage: vi.fn(),
      needsVerification: false,
      resendCooldown: 0,
      handleGoogleSignIn: vi.fn(),
      handleAppleSignIn: vi.fn(),
      handleSubmit: vi.fn(),
      handleForgotPassword: vi.fn(),
      handleResetPassword: vi.fn(),
      handleResendVerification: vi.fn(),
      verifyMode: mockVerifyMode,
      otpCode: '',
      setOtpCode: vi.fn(),
      otpEmail: 'ana@example.com',
      handleVerifyCode: vi.fn(),
      handleBackFromVerify: vi.fn(),
    };
  },
}));

import AuthPage from './page';

describe('AuthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockLanguage = 'en';
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockVerifyMode = null;
    mockIsLogin = true;
    mockIsResetPassword = false;
  });

  it('renders sign-in form by default', async () => {
    render(<AuthPage />);

    expect(screen.getByText('Welcome back!')).toBeInTheDocument();
    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  it('toggles to sign-up form', async () => {
    mockIsLogin = false;
    render(<AuthPage />);

    expect(screen.getAllByText('Join the community').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sign Up').length).toBeGreaterThan(0);
  });

  it('shows email input', async () => {
    render(<AuthPage />);
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('shows password input', async () => {
    render(<AuthPage />);
    expect(screen.getByText('Password')).toBeInTheDocument();
  });

  it('shows forgot password link on login', async () => {
    render(<AuthPage />);
    expect(screen.getByText('Forgot password?')).toBeInTheDocument();
  });

  it('shows Spanish text when language is es', async () => {
    mockLanguage = 'es';
    render(<AuthPage />);

    expect(screen.getByText('¡Bienvenido de nuevo!')).toBeInTheDocument();
    expect(screen.getByText('Iniciar Sesión')).toBeInTheDocument();
  });

  it('shows name and birth date fields on signup', async () => {
    mockIsLogin = false;
    render(<AuthPage />);

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Date of Birth')).toBeInTheDocument();
  });

  it('shows terms of service link on signup', async () => {
    mockIsLogin = false;
    render(<AuthPage />);

    expect(screen.getByText('Terms of Service')).toBeInTheDocument();
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
  });

  it('language toggle switches all text to Spanish', async () => {
    mockLanguage = 'es';
    render(<AuthPage />);

    expect(screen.getByText('¡Bienvenido de nuevo!')).toBeInTheDocument();
    expect(screen.getByText('Correo Electrónico')).toBeInTheDocument();
    expect(screen.getByText('Contraseña')).toBeInTheDocument();
    expect(screen.getByText('¿Olvidaste tu contraseña?')).toBeInTheDocument();
  });

  // BUG-225: confirm-password field on registration
  it('shows confirm password field on signup form', async () => {
    mockIsLogin = false;
    render(<AuthPage />);

    expect(screen.getByText('Confirm Password')).toBeInTheDocument();
  });

  // BUG-226: show/hide password toggle
  it('renders show password toggle button on login form', async () => {
    render(<AuthPage />);

    await vi.waitFor(() => {
      expect(screen.getByText('Welcome back!')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Show password')).toBeInTheDocument();
  });

  it('toggling eye icon reveals the password field value', async () => {
    render(<AuthPage />);

    await vi.waitFor(() => {
      expect(screen.getByText('Welcome back!')).toBeInTheDocument();
    });

    const pwInput = screen.getByPlaceholderText('••••••••');
    expect(pwInput).toHaveAttribute('type', 'password');

    const toggleBtn = screen.getByLabelText('Show password');
    fireEvent.click(toggleBtn);

    expect(pwInput).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Hide password')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Task 5: verify-branch rendering
  // ---------------------------------------------------------------------------
  it('shows the code-entry screen when verifyMode is signup', async () => {
    mockVerifyMode = 'signup';
    render(<AuthPage />);

    // Heading shows verify title, not login/signup title
    expect(screen.getByText('Verify your account')).toBeInTheDocument();
    // VerifyCodeForm renders its instruction text (email is 'ana@example.com' from mock)
    expect(screen.getByText(/Enter the 6-digit code we sent to ana@example\.com/i)).toBeInTheDocument();
    // Verify button is present
    expect(screen.getByRole('button', { name: /verify/i })).toBeInTheDocument();
    // OAuth buttons and login/signup toggle are hidden
    expect(screen.queryByText("Don't have an account? Sign up")).not.toBeInTheDocument();
    expect(screen.queryByText('Already have an account? Sign in')).not.toBeInTheDocument();
  });
});
