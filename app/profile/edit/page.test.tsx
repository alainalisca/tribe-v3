import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const mockGetUser = vi.fn().mockResolvedValue({
  data: {
    user: {
      id: 'user-1',
      email: 'test@example.com',
    },
  },
});

const mockProfileData = {
  name: 'Test User',
  username: 'testuser',
  bio: 'Hello there',
  location: 'Medellín',
  phone: '+57123456',
  preferred_sports: ['Running'],
  emergency_contact_name: 'Mom',
  emergency_contact_phone: '+1234567890',
  photos: [],
};

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: mockProfileData, error: null }),
        }),
      }),
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/photo.jpg' } }),
      }),
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

vi.mock('@/lib/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showInfo: vi.fn(),
}));

vi.mock('@/lib/errorMessages', () => ({
  getErrorMessage: vi.fn(() => 'Error'),
}));

vi.mock('@/lib/logger', () => ({
  logError: vi.fn(),
}));

vi.mock('@/lib/translations', () => ({
  sportTranslations: { Running: { es: 'Correr' } },
}));

vi.mock('@/lib/sports', () => ({
  SPORTS_LIST: ['Running', 'Soccer', 'Basketball'],
}));

import EditProfilePage from './page';

describe('EditProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLanguage = 'en';
  });

  it('renders edit profile heading', async () => {
    render(<EditProfilePage />);

    await vi.waitFor(() => {
      expect(screen.getByText('Edit Profile')).toBeInTheDocument();
    });
  });

  it('renders name field', async () => {
    render(<EditProfilePage />);

    await vi.waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
    });
  });

  it('renders username field', async () => {
    render(<EditProfilePage />);

    await vi.waitFor(() => {
      expect(screen.getByText('Username')).toBeInTheDocument();
    });
  });

  it('renders bio field', async () => {
    render(<EditProfilePage />);

    await vi.waitFor(() => {
      expect(screen.getByText('Bio')).toBeInTheDocument();
    });
  });

  it('renders emergency contact section', async () => {
    render(<EditProfilePage />);

    await vi.waitFor(() => {
      const { container } = render(<EditProfilePage />);
      // Wait for profile data to load — check for any field that renders after load
      return vi.waitFor(
        () => {
          expect(container.textContent).toContain('Emergency Contact');
        },
        { timeout: 3000 }
      );
    });
  });

  it('renders sports section', async () => {
    render(<EditProfilePage />);

    await vi.waitFor(
      () => {
        expect(screen.getByText('Sports & Activities')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('shows bilingual labels in Spanish', async () => {
    mockLanguage = 'es';
    render(<EditProfilePage />);

    await vi.waitFor(() => {
      expect(screen.getByText('Editar Perfil')).toBeInTheDocument();
    });

    expect(screen.getByText('Nombre')).toBeInTheDocument();
    expect(screen.getByText('Biografía')).toBeInTheDocument();
  });

  it('shows save button', async () => {
    render(<EditProfilePage />);

    await vi.waitFor(
      () => {
        expect(screen.getByText('Save Profile')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('renders photos section', async () => {
    render(<EditProfilePage />);

    await vi.waitFor(
      () => {
        // Photos heading includes count: "Photos (0/6)"
        expect(screen.getByText(/Photos \(/)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });
});
