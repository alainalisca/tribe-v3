import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SessionCard from './SessionCard';
import ParticipantList from './session/ParticipantList';
import type { SessionWithRelations } from '@/lib/dal';

/**
 * T-ATH7: the feed card and the session detail page must print the SAME
 * athlete count for the same session.
 *
 * THE DEFECT THIS EXISTS TO MAKE UNREPEATABLE. Before 2026-09-16 the two
 * surfaces applied different arithmetic to the same roster:
 *
 *   SessionCard      `{confirmedParticipants.length}/{max}`   -> 3/10
 *   ParticipantList  `({participants.length + 1})`            -> Atletas (4)
 *
 * They disagreed by one on all 363 live sessions, and on the 23 sessions that
 * also carry a real host row in session_participants the host rendered twice on
 * the detail page -- once as the host, once as an ordinary athlete with an
 * action column.
 *
 * WHY BOTH ASSERTIONS ARE HERE, AND WHY EITHER ALONE WOULD BE WORTHLESS:
 *
 *   - Parity alone ("the two numbers match") passes if BOTH surfaces drop the
 *     host filter, because both would then say 4. Agreeing on a wrong number
 *     is the failure mode that shipped.
 *   - The absolute count alone ("it is 3") would not notice a `+ 1` restored
 *     to only one surface if that surface were the one not asserted.
 *
 * So each test reads the number out of the RENDERED DOM of both components and
 * asserts they are equal AND equal to the athlete count. Reading the DOM rather
 * than calling the shared helper is deliberate: a helper-level test would
 * assert that one function equals itself and would pass through any arithmetic
 * a component added on top.
 *
 * UPDATED 2026-09-17, and this changes what the parity tests are worth.
 * SessionCard no longer counts the roster array at all -- it reads
 * sessions.current_participants, because fetchUpcomingSessions returns
 * `participants: []` and that is the home feed, the card's only production
 * consumer. ParticipantList still enumerates the array, because its job is to
 * list WHO is coming, not how many seats are taken.
 *
 * So the two surfaces now read genuinely different things, and the parity tests
 * below assert the weaker but still useful property: GIVEN a session whose
 * counter and roster agree, the two surfaces print the same number. They no
 * longer catch a change of source on their own -- the "one capacity source"
 * block at the bottom of this file does that, by handing the card a session
 * whose counter and array DISAGREE and pinning every capacity-derived output to
 * the counter.
 */

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

// One mock for both components: SessionCard reads `language`, ParticipantList
// reads `t`. Returning the key itself keeps the assertions off translated copy.
vi.mock('@/lib/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key }),
}));

vi.mock('@/lib/translations', () => ({
  sportTranslations: { Running: { en: 'Running', es: 'Correr' } },
  translateSport: (sport: string) => sport,
  TranslationKey: {},
}));

vi.mock('@/lib/utils', () => ({
  formatTime12Hour: (time: string) => time,
  cn: (...inputs: string[]) => inputs.filter(Boolean).join(' '),
}));

vi.mock('@/lib/city-config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/city-config')>()),
  detectNeighborhood: () => null,
  getNearestNeighborhood: () => null,
}));

vi.mock('@/lib/sport-images', () => ({
  getSessionHeroImage: () => 'https://example.com/hero.jpg',
  getSportGradient: () => 'from-blue-500 to-purple-500',
}));

vi.mock('@/lib/share', () => ({ shareSession: vi.fn() }));
// Rendered as an observable marker, NOT null. A null mock would make
// "the avatars come from the roster array" pass whatever the component did.
vi.mock('@/components/AvatarStack', () => ({
  default: ({ participants }: { participants: unknown[] }) => (
    <div data-testid="avatar-stack">{participants.length}</div>
  ),
}));
vi.mock('@/components/ShareButton', () => ({ default: () => null }));

const HOST_ID = 'creator-1';

/**
 * One roster, handed to both surfaces unchanged -- that is the whole point of
 * the test. Three of these five rows are athletes.
 */
function roster() {
  return [
    // The T-ATH7 row: the host's own participant row. 23 of these exist live.
    {
      user_id: HOST_ID,
      status: 'confirmed',
      is_guest: false,
      guest_name: null,
      payment_status: null,
      user: { id: HOST_ID, name: 'Al', avatar_url: null },
    },
    {
      user_id: 'athlete-1',
      status: 'confirmed',
      is_guest: false,
      guest_name: null,
      payment_status: null,
      user: { id: 'athlete-1', name: 'Ana', avatar_url: null },
    },
    {
      user_id: 'athlete-2',
      status: 'confirmed',
      is_guest: false,
      guest_name: null,
      payment_status: null,
      user: { id: 'athlete-2', name: 'Victor', avatar_url: null },
    },
    // A guest: user_id NULL, so it can never match creator_id. Guests are
    // attendees and keep their seat.
    {
      user_id: null,
      status: 'confirmed',
      is_guest: true,
      guest_name: 'Veronica',
      payment_status: null,
      user: null,
    },
    // Pending is not a seat on either surface.
    {
      user_id: 'athlete-3',
      status: 'pending',
      is_guest: false,
      guest_name: null,
      payment_status: null,
      user: { id: 'athlete-3', name: 'Felipe', avatar_url: null },
    },
  ];
}

const EXPECTED_ATHLETES = 3; // athlete-1, athlete-2, the guest. Not the host, not the pending row.

function session(): SessionWithRelations {
  return {
    id: 'session-1',
    creator_id: HOST_ID,
    sport: 'Running',
    location: 'Medellín Park',
    location_lat: null,
    location_lng: null,
    date: '2099-04-25',
    start_time: '18:00',
    duration: 60,
    max_participants: 10,
    current_participants: 3,
    status: 'active',
    price_cents: 0,
    currency: 'USD',
    description: 'Weekly 5k run',
    photos: [],
    participants: roster(),
    creator: { id: HOST_ID, name: 'Al', avatar_url: null },
  } as unknown as SessionWithRelations;
}

/**
 * The capacity readout on the feed card: `{n}/{max} athletes`.
 *
 * Asserting on EXACTLY ONE match matters. If a redesign ever adds a second
 * "n/m" span the extraction would silently start reading the wrong element, so
 * the ambiguity fails the test instead of quietly changing what it measures.
 */
function cardAthleteCount(container: HTMLElement): number {
  const matches = Array.from(container.querySelectorAll('span'))
    .map((el) => /^(\d+)\/(\d+)(\s|$)/.exec(el.textContent ?? ''))
    .filter((m): m is RegExpExecArray => m !== null);
  expect(matches).toHaveLength(1);
  return Number(matches[0][1]);
}

/** The roster heading on the detail page: `participants (n)`. */
function listAthleteCount(container: HTMLElement): number {
  const heading = container.querySelector('h2');
  const match = /\((\d+)\)/.exec(heading?.textContent ?? '');
  expect(match).not.toBeNull();
  return Number(match![1]);
}

function renderList(s: SessionWithRelations) {
  return render(
    <ParticipantList
      creator={{ id: HOST_ID, name: 'Al', avatar_url: null, average_rating: null, total_reviews: null }}
      creatorId={s.creator_id}
      participants={roster()}
      canKick={false}
      isCreator={false}
      isPaidSession={false}
      language="en"
      onKickUser={vi.fn()}
    />
  );
}

describe('athlete count parity: SessionCard vs ParticipantList', () => {
  it('both surfaces print the same number for the same session', () => {
    const s = session();
    const card = cardAthleteCount(render(<SessionCard session={s} />).container);
    const list = listAthleteCount(renderList(s).container);

    expect(card).toBe(list);
  });

  it('and that number is the athlete count: host excluded, guest included, pending excluded', () => {
    const s = session();

    expect(cardAthleteCount(render(<SessionCard session={s} />).container)).toBe(EXPECTED_ATHLETES);
    expect(listAthleteCount(renderList(s).container)).toBe(EXPECTED_ATHLETES);
  });

  it('parity holds on a session with no host row, which is 340 of the 363 live sessions', () => {
    const s = session();
    // Same roster minus the host row: the ordinary case, where the old `+ 1`
    // was still wrong by one even though nothing rendered twice.
    (s as unknown as Record<string, unknown>).participants = roster().filter((p) => p.user_id !== HOST_ID);

    const card = cardAthleteCount(render(<SessionCard session={s} />).container);
    const { container } = render(
      <ParticipantList
        creator={{ id: HOST_ID, name: 'Al', avatar_url: null, average_rating: null, total_reviews: null }}
        creatorId={s.creator_id}
        participants={roster().filter((p) => p.user_id !== HOST_ID)}
        canKick={false}
        isCreator={false}
        isPaidSession={false}
        language="en"
        onKickUser={vi.fn()}
      />
    );

    expect(card).toBe(listAthleteCount(container));
    expect(card).toBe(EXPECTED_ATHLETES);
  });
});

describe('the host renders once, as the host', () => {
  it('does not appear a second time as an ordinary athlete', () => {
    const { container } = renderList(session());

    // The host's name is in the creator card. If the host row also rendered in
    // the loop it would appear twice, and the second one would carry a
    // /profile/<host> link from the athlete branch.
    const hostLinks = container.querySelectorAll(`a[href="/profile/${HOST_ID}"]`);
    expect(hostLinks).toHaveLength(1);

    // And that single link is the host card -- it is labelled as the host.
    expect(hostLinks[0].textContent).toContain('host');
  });

  it('still renders the guest and the confirmed athletes', () => {
    const { container } = renderList(session());
    expect(container.textContent).toContain('Ana');
    expect(container.textContent).toContain('Victor');
    expect(container.textContent).toContain('Veronica');
  });
});

/**
 * ONE CAPACITY SOURCE.
 *
 * Every capacity-derived thing SessionCard renders -- the n/max readout, the
 * "N spots left" badge, the "Filling up" badge -- must come from
 * sessions.current_participants and nothing else. The way to prove that is to
 * hand the card a session whose counter and roster array DISAGREE and check
 * which number comes out. A fixture where they agree proves nothing, which is
 * exactly why the parity tests above can no longer carry this on their own.
 *
 * WHAT WAS WRONG BEFORE. spotsLeft and fillingFast counted the roster array
 * while isFull read the counter. Because fetchUpcomingSessions
 * (lib/dal/sessions.ts:415) returns `participants: []`, and app/page.tsx is the
 * ONLY production consumer of this component, the array was always empty in
 * production. So on the app's main surface: spotsLeft was always
 * max_participants, "Filling up" could never fire, and the whole avatar +
 * capacity row was gated on `confirmedParticipants.length > 0` and therefore
 * never rendered at all. Three pieces of UI were dead, not merely inconsistent.
 */
describe('one capacity source: the counter, never the roster array', () => {
  /** A session whose counter and roster deliberately disagree. */
  function disagreeing(counter: number, max: number, rosterSize: number): SessionWithRelations {
    return {
      ...session(),
      max_participants: max,
      current_participants: counter,
      participants: Array.from({ length: rosterSize }, (_, i) => ({
        user_id: `athlete-${i}`,
        status: 'confirmed',
        is_guest: false,
        guest_name: null,
        payment_status: null,
        user: { id: `athlete-${i}`, name: `Athlete ${i}`, avatar_url: null },
      })),
    } as unknown as SessionWithRelations;
  }

  it('prints the counter in the n/max readout, not the roster length', () => {
    // Counter says 7, the array holds 2. 7 is the answer.
    const { container } = render(<SessionCard session={disagreeing(7, 10, 2)} />);
    expect(container.textContent).toContain('7/10');
    expect(container.textContent).not.toContain('2/10');
  });

  it('derives the spots-left badge from the counter', () => {
    // 10 - 7 = 3 spots. From the array it would have been 10 - 2 = 8.
    render(<SessionCard session={disagreeing(7, 10, 2)} />);
    expect(screen.getByText('3 spots left')).toBeInTheDocument();
    expect(screen.queryByText('8 spots left')).toBeNull();
  });

  it('derives the filling-up badge from the counter', () => {
    // 14/20 is exactly 70%, so fillingFast. spotsLeft is 6, which keeps the
    // higher-priority spots-left branch (<= 3) out of the way so this badge is
    // reachable at all. From the array, 2/20 would never fill up.
    render(<SessionCard session={disagreeing(14, 20, 2)} />);
    expect(screen.getByText(/Filling up/)).toBeInTheDocument();
  });

  /**
   * THE HOME-FEED CASE. Counter populated, array empty -- exactly what
   * fetchUpcomingSessions produces for every session on app/page.tsx. Before
   * this change the row did not render here at all.
   */
  it('renders the capacity row from the counter alone, with an empty roster', () => {
    const { container } = render(<SessionCard session={disagreeing(4, 10, 0)} />);
    expect(container.textContent).toContain('4/10');
  });

  it('takes the avatars from the roster array, on a separate gate from the count', () => {
    // Empty roster: the number renders, no avatar stack. The count is the
    // information; the faces are whichever rows the query happened to load.
    const empty = render(<SessionCard session={disagreeing(4, 10, 0)} />);
    expect(empty.container.textContent).toContain('4/10');
    expect(empty.container.querySelector('[data-testid="avatar-stack"]')).toBeNull();

    // Populated roster: the stack renders, and it is fed the ARRAY's length,
    // not the counter's value.
    const loaded = render(<SessionCard session={disagreeing(7, 10, 2)} />);
    const stack = loaded.container.querySelector('[data-testid="avatar-stack"]');
    expect(stack).not.toBeNull();
    expect(stack!.textContent).toBe('2');
  });

  it('does not render the capacity row when the counter is zero', () => {
    const { container } = render(<SessionCard session={disagreeing(0, 10, 0)} />);
    expect(container.textContent).not.toContain('0/10');
  });
});
