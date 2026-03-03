import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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

import AuthPage from './page';

describe('AuthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockLanguage = 'en';
    mockGetUser.mockResolvedValue({ data: { user: null } });
  });

  it('renders sign-in form by default', async () => {
    render(<AuthPage />);

    // Wait for auth check to complete
    await vi.waitFor(() => {
      expect(screen.getByText('Welcome back!')).toBeInTheDocument();
    });

    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  it('toggles to sign-up form', async () => {
    render(<AuthPage />);

    await vi.waitFor(() => {
      expect(screen.getByText("Don't have an account? Sign up")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Don't have an account? Sign up"));

    expect(screen.getByText('Join the community')).toBeInTheDocument();
    expect(screen.getByText('Sign Up')).toBeInTheDocument();
  });

  it('shows email input', async () => {
    render(<AuthPage />);

    await vi.waitFor(() => {
      expect(screen.getByText('Email')).toBeInTheDocument();
    });
  });

  it('shows password input', async () => {
    render(<AuthPage />);

    await vi.waitFor(() => {
      expect(screen.getByText('Password')).toBeInTheDocument();
    });
  });

  it('shows forgot password link on login', async () => {
    render(<AuthPage />);

    await vi.waitFor(() => {
      expect(screen.getByText('Forgot password?')).toBeInTheDocument();
    });
  });

  it('shows Spanish text when language is es', async () => {
    mockLanguage = 'es';
    render(<AuthPage />);

    await vi.waitFor(() => {
      expect(screen.getByText('¡Bienvenido de nuevo!')).toBeInTheDocument();
    });

    expect(screen.getByText('Iniciar Sesión')).toBeInTheDocument();
  });

  it('shows name and birth date fields on signup', async () => {
    render(<AuthPage />);

    await vi.waitFor(() => {
      expect(screen.getByText("Don't have an account? Sign up")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Don't have an account? Sign up"));

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Date of Birth')).toBeInTheDocument();
  });

  it('shows terms of service link on signup', async () => {
    render(<AuthPage />);

    await vi.waitFor(() => {
      expect(screen.getByText("Don't have an account? Sign up")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Don't have an account? Sign up"));

    expect(screen.getByText('Terms of Service')).toBeInTheDocument();
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
  });

  it('language toggle switches all text to Spanish', async () => {
    mockLanguage = 'es';
    render(<AuthPage />);

    await vi.waitFor(() => {
      expect(screen.getByText('¡Bienvenido de nuevo!')).toBeInTheDocument();
    });

    expect(screen.getByText('Correo Electrónico')).toBeInTheDocument();
    expect(screen.getByText('Contraseña')).toBeInTheDocument();
    expect(screen.getByText('¿Olvidaste tu contraseña?')).toBeInTheDocument();
  });
});
