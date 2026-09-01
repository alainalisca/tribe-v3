import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DoorCheckInCard from './DoorCheckInCard';
import { addSessionGuest } from '@/lib/dal';

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
// Bypass the not-ended gate without pulling AttendanceTracker's whole dep tree.
vi.mock('@/components/AttendanceTracker', () => ({ sessionHasEnded: () => false }));
vi.mock('@/lib/dal', () => ({ addSessionGuest: vi.fn(), removeSessionGuest: vi.fn() }));

const baseProps = {
  sessionId: 's-1',
  isCreator: true,
  isAdmin: false,
  sessionDate: '2099-01-01',
  sessionStartTime: '10:00:00',
  sessionEndTime: '11:00:00',
  sessionStatus: 'active',
  language: 'en' as const,
  onChange: vi.fn(),
};

function addName(value: string) {
  const input = screen.getByPlaceholderText('Type a name');
  fireEvent.change(input, { target: { value } });
  fireEvent.submit(input.closest('form') as HTMLFormElement);
}

describe('DoorCheckInCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the added person in the local list and makes Remove reachable after a successful add', async () => {
    (addSessionGuest as Mock).mockResolvedValue({ success: true, data: { participantId: 'p-1' } });

    render(<DoorCheckInCard {...baseProps} />);
    // Empty state up front.
    expect(screen.getByText('No one added yet. Type a name and tap Add.')).toBeInTheDocument();

    addName('J Cole');

    // The person appears in the running list (not wiped by a refresh)...
    expect(await screen.findByText('J Cole')).toBeInTheDocument();
    // ...and the one-tap Remove is present and reachable.
    expect(screen.getByLabelText('Remove J Cole')).toBeInTheDocument();
    expect(baseProps.onChange).toHaveBeenCalledTimes(1);
  });

  it('does not submit an empty or whitespace-only name', async () => {
    (addSessionGuest as Mock).mockResolvedValue({ success: true, data: { participantId: 'p-x' } });
    render(<DoorCheckInCard {...baseProps} />);
    addName('   ');
    expect(addSessionGuest).not.toHaveBeenCalled();
  });

  it('renders a long name with the truncation classes so it cannot push the row past the viewport', async () => {
    (addSessionGuest as Mock).mockResolvedValue({ success: true, data: { participantId: 'p-2' } });

    render(<DoorCheckInCard {...baseProps} />);
    const longName = 'Maria Fernanda Gonzalez Restrepo de la Cuesta Villegas';
    addName(longName);

    const nameEl = await screen.findByText(longName);
    // truncate only actually clips inside a flex row when the child can shrink,
    // which requires min-w-0. Assert both so the fix cannot silently regress.
    expect(nameEl.className).toContain('truncate');
    expect(nameEl.className).toContain('min-w-0');
  });
});
