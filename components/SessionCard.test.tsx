import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SessionCard from './SessionCard';
import type { SessionWithRelations } from '@/lib/dal';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('@/lib/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        hostedBy: 'Hosted by',
        spotsLeft: 'spots left',
        allLevels: 'All Levels',
        beginner: 'Beginner',
        intermediate: 'Intermediate',
        advanced: 'Advanced',
        womenOnly: 'Women Only',
        menOnly: 'Men Only',
        ended: 'Ended',
        full: 'Full',
        viewDetails: 'View Details',
      };
      return map[key] || key;
    },
    language: 'en',
  }),
}));

vi.mock('@/lib/translations', () => ({
  sportTranslations: { Running: { es: 'Correr' } },
  TranslationKey: {},
}));

vi.mock('@/lib/utils', () => ({
  formatTime12Hour: (time: string) => time,
}));

function createMockSession(overrides: Partial<SessionWithRelations> = {}): SessionWithRelations {
  return {
    id: 'session-1',
    sport: 'Running',
    date: '2026-04-01',
    start_time: '10:00',
    location: 'Central Park',
    max_participants: 10,
    current_participants: 3,
    duration: 60,
    status: 'active',
    creator_id: 'creator-1',
    skill_level: 'all_levels',
    gender_preference: 'all',
    description: 'Morning run',
    equipment: null,
    latitude: null,
    longitude: null,
    created_at: '2026-01-01',
    join_policy: 'open',
    reminder_sent: false,
    is_recurring: false,
    recurrence_pattern: null,
    participants: [
      { user_id: 'user-1', status: 'confirmed', user: { id: 'user-1', name: 'Alice', avatar_url: null } },
      { user_id: 'user-2', status: 'confirmed', user: { id: 'user-2', name: 'Bob', avatar_url: null } },
    ],
    creator: {
      id: 'creator-1',
      name: 'Host User',
      avatar_url: null,
      average_rating: 4.5,
      total_reviews: 10,
    },
    ...overrides,
  } as SessionWithRelations;
}

describe('SessionCard', () => {
  it('renders session sport name', () => {
    render(<SessionCard session={createMockSession()} />);
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('renders session location', () => {
    render(<SessionCard session={createMockSession()} />);
    expect(screen.getByText('Central Park')).toBeInTheDocument();
  });

  it('renders session date formatted', () => {
    const { container } = render(<SessionCard session={createMockSession()} />);
    // Date is rendered via toLocaleDateString — look for Apr or Wed
    expect(container.textContent).toMatch(/Apr|Wed/);
  });

  it('shows participant count as confirmed/max', () => {
    render(<SessionCard session={createMockSession()} />);
    // 2 confirmed participants out of 10
    expect(screen.getByText('2/10')).toBeInTheDocument();
  });

  it('shows confirmed participant initials', () => {
    render(<SessionCard session={createMockSession()} />);
    expect(screen.getByText('A')).toBeInTheDocument(); // Alice
    expect(screen.getByText('B')).toBeInTheDocument(); // Bob
  });

  it('shows creator name with hosted by prefix', () => {
    const { container } = render(<SessionCard session={createMockSession()} />);
    expect(container.textContent).toContain('Hosted by');
    expect(container.textContent).toContain('Host User');
  });

  it('hides chat button for non-participants', () => {
    render(<SessionCard session={createMockSession()} currentUserId="random-user" />);
    const chatLinks = screen.queryAllByTitle(/chat/i);
    expect(chatLinks.length).toBe(0);
  });

  it('shows skill level badge for beginner', () => {
    const { container } = render(<SessionCard session={createMockSession({ skill_level: 'beginner' })} />);
    expect(container.textContent).toContain('Beginner');
  });

  it('shows gender preference badge for women only', () => {
    const { container } = render(<SessionCard session={createMockSession({ gender_preference: 'women_only' })} />);
    expect(container.textContent).toContain('Women Only');
  });

  it('navigates to session detail on click', () => {
    const { container } = render(<SessionCard session={createMockSession()} />);
    const card = container.firstChild as HTMLElement;
    fireEvent.click(card);
    expect(mockPush).toHaveBeenCalledWith('/session/session-1');
  });

  it('shows description text', () => {
    render(<SessionCard session={createMockSession()} />);
    expect(screen.getByText('Morning run')).toBeInTheDocument();
  });

  it('shows creator rating', () => {
    const { container } = render(<SessionCard session={createMockSession()} />);
    expect(container.textContent).toContain('4.5');
  });
});
