import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

/**
 * The Origen tab (T-GROW1 part F).
 *
 * WHAT IS WORTH ASSERTING, which is narrower than "it renders".
 *
 * This screen's whole purpose is to be TRUSTED with a number Al is about to put
 * in front of a gym. So the arms are the ways it could show a number that is
 * wrong or that claims more than it knows:
 *
 *   - the totals row must agree with the rows above it
 *   - a show-up rate with no leads must be a DASH, not 0%
 *   - the untagged row must be labelled, not blank
 *   - changing the GROUPING must not refetch (it re-adds rows in hand), while
 *     changing the PERIOD must
 *   - the missing signups/bookings columns must be EXPLAINED on screen
 *
 * The last one matters because an unexplained absence reads as an oversight and
 * a zero would read as a measurement.
 */

vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es' }) }));
vi.mock('@/lib/i18n/useTranslations', () => ({
  // The key itself, so an assertion cannot accidentally pass on a shared word
  // and a missing key is visible as a bare key rather than as plausible copy.
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));
// The builder is its own component with its own tests; mocking it keeps this file
// about the table and stops a change there from failing arms about numbers.
vi.mock('./TrackedLinkBuilder', () => ({ default: () => <div data-testid="builder" /> }));
// T-GROW2: Referidos is its own component with its own tests and its own fetch.
// Stubbed so this file's fetch counts stay about the Origen read, and the stub
// RECORDS the range it is handed: the arm at the bottom asserts the wiring the
// stub would otherwise hide.
vi.mock('./AdminReferidosSection', () => ({
  default: ({ range }: { range: number | null }) => <div data-testid="referidos" data-range={String(range)} />,
}));

import AdminOrigenTab from './AdminOrigenTab';
import { showError } from '@/lib/toast';

const ROWS = [
  {
    src: 'runclub',
    code: 'RC-01',
    utm_campaign: 'hyrox-oct',
    attr_ref: null,
    visits: 10,
    leads: 4,
    contacted: 3,
    attended: 1,
  },
  {
    src: 'instagram',
    code: 'IG-01',
    utm_campaign: 'hyrox-oct',
    attr_ref: null,
    visits: 40,
    leads: 2,
    contacted: 1,
    attended: 0,
  },
  // The untagged row, which is the biggest one in production today.
  { src: null, code: null, utm_campaign: null, attr_ref: null, visits: 5, leads: 3, contacted: 0, attended: 0 },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: ROWS }) }) as unknown as Response);
  vi.stubGlobal('fetch', fetchMock);
});

/** The data rows of the table, excluding the totals row. */
function dataRows(): HTMLElement[] {
  const rows = screen.getAllByRole('row');
  // row 0 is the header; the last is the totals row.
  return rows.slice(1, -1);
}

describe('AdminOrigenTab', () => {
  it('asks for 30 days on first load', async () => {
    render(<AdminOrigenTab />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // The default has to be a real window rather than all-time: the first thing
    // the tab shows is the number most likely to be quoted.
    expect(String(fetchMock.mock.calls[0][0])).toContain('tab=origen');
    expect(String(fetchMock.mock.calls[0][0])).toContain('days=30');
  });

  it('renders one row per channel and a totals row that AGREES with them', async () => {
    render(<AdminOrigenTab />);
    await waitFor(() => expect(dataRows()).toHaveLength(3));

    const totals = screen.getAllByRole('row').at(-1)!;
    // 10+40+5 visits, 4+2+3 leads, 3+1+0 contacted, 1+0+0 attended. Asserted
    // against the arithmetic rather than against a hardcoded render, because a
    // total that disagrees with the rows above it is how a reader stops trusting
    // the screen.
    expect(within(totals).getByText('55')).toBeTruthy();
    expect(within(totals).getByText('9')).toBeTruthy();
    expect(within(totals).getByText('4')).toBeTruthy();
  });

  /**
   * AN EQUIVALENT MUTANT, RECORDED RATHER THAN DROPPED.
   *
   * Computing the totals from a DIFFERENT grouping than the table shows cannot
   * be killed by any assertion on the numbers, and the reason is arithmetic
   * rather than a gap here: grouping PARTITIONS the same rows, so the sum over
   * the groups is the same whichever dimension they were collapsed along.
   * `totalOrigin(groupOriginRows(rows, X))` is invariant in X.
   *
   * So this arm asserts the invariant itself instead of pretending to catch the
   * mutation. It is a real property worth pinning -- it is the reason the totals
   * row stays correct when the toggle moves -- and it is the honest version of
   * "we checked". What WOULD make the two diverge is a future grouping that
   * filtered rows rather than partitioning them, and that is precisely when this
   * arm would start failing and the mutation would stop being equivalent.
   */
  it('shows the SAME totals under every grouping, because grouping only partitions', async () => {
    render(<AdminOrigenTab />);
    await waitFor(() => expect(dataRows()).toHaveLength(3));
    const read = () => {
      const totals = screen.getAllByRole('row').at(-1)!;
      return within(totals)
        .getAllByRole('cell')
        .map((c) => c.textContent);
    };
    const bySrc = read();

    fireEvent.change(screen.getByLabelText('groupByLabel'), { target: { value: 'utm_campaign' } });
    await waitFor(() => expect(dataRows()).toHaveLength(2));
    // The label cell spans a different number of columns, so only the numbers
    // are compared: the last five cells are visits, leads, contacted, attended
    // and the rate.
    expect(read().slice(-5)).toEqual(bySrc.slice(-5));
  });

  it('labels the untagged row rather than leaving it blank', async () => {
    render(<AdminOrigenTab />);
    // An empty cell is indistinguishable from a rendering bug, and this is the
    // row T-GROW exists to shrink -- it has to be visible to be acted on.
    await waitFor(() => expect(screen.getByText('noSource')).toBeTruthy());
  });

  it('shows a DASH and not 0% for a channel with no leads', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            src: 'poster',
            code: null,
            utm_campaign: null,
            attr_ref: null,
            visits: 12,
            leads: 0,
            contacted: 0,
            attended: 0,
          },
        ],
      }),
    } as unknown as Response);
    render(<AdminOrigenTab />);
    await waitFor(() => expect(dataRows()).toHaveLength(1));
    // 0% claims a measurement nobody took: a channel with no leads has no
    // show-up rate at all. Same reason migration 213 returns no signups column
    // rather than a column of zeros.
    expect(within(dataRows()[0]).getByText('—')).toBeTruthy();
    expect(within(dataRows()[0]).queryByText('0%')).toBeNull();
  });

  it('computes the rate from attended over leads', async () => {
    render(<AdminOrigenTab />);
    await waitFor(() => expect(dataRows()).toHaveLength(3));
    // runclub: 1 of 4.
    expect(within(dataRows().find((r) => within(r).queryByText('runclub'))!).getByText('25%')).toBeTruthy();
  });

  it('REFETCHES when the period changes', async () => {
    render(<AdminOrigenTab />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'range7' }));
    // A different period is a different question for the database.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1][0])).toContain('days=7');
  });

  it('sends days=all for the all-time range', async () => {
    render(<AdminOrigenTab />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'rangeAll' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1][0])).toContain('days=all');
  });

  it('does NOT refetch when the grouping changes, and regroups in place', async () => {
    render(<AdminOrigenTab />);
    await waitFor(() => expect(dataRows()).toHaveLength(3));

    fireEvent.change(screen.getByLabelText('groupByLabel'), { target: { value: 'utm_campaign' } });

    // THE ARM THAT JUSTIFIES THE WHOLE DESIGN. Migration 213 returns four
    // dimensions and lib/growth/originGrouping.ts collapses them precisely so
    // this toggle costs no round trip. runclub and instagram share hyrox-oct, so
    // three rows become two.
    await waitFor(() => expect(dataRows()).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const campaignRow = dataRows().find((r) => within(r).queryByText('hyrox-oct'))!;
    // 10 + 40 visits, 4 + 2 leads, summed across the two sources.
    expect(within(campaignRow).getByText('50')).toBeTruthy();
    expect(within(campaignRow).getByText('6')).toBeTruthy();
  });

  it('explains the columns that are missing rather than showing zeros', async () => {
    render(<AdminOrigenTab />);
    // An absent column with no explanation reads as an oversight. A zero under
    // "Registros" would read as "this channel sent nobody who joined", when the
    // truth is that nothing records it yet.
    await waitFor(() => expect(screen.getByText('pendingNote')).toBeTruthy());
    expect(screen.queryByText('colSignups')).toBeNull();
    expect(screen.queryByText('colBookings')).toBeNull();
  });

  it('shows the empty state when nothing is tagged yet', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) } as unknown as Response);
    render(<AdminOrigenTab />);
    await waitFor(() => expect(screen.getByText('empty')).toBeTruthy());
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('keeps the rows on screen and reports the error when a refresh fails', async () => {
    render(<AdminOrigenTab />);
    await waitFor(() => expect(dataRows()).toHaveLength(3));

    fetchMock.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
    fireEvent.click(screen.getByRole('button', { name: 'range7' }));

    // Asserts the RECOGNITION as well as the aftermath. Correct handling and no
    // handling would both leave the rows on screen, so "the table is still
    // there" alone cannot tell them apart.
    await waitFor(() => expect(showError).toHaveBeenCalledWith('loadError'));
    expect(dataRows()).toHaveLength(3);
  });

  it('renders the link builder below the table', async () => {
    render(<AdminOrigenTab />);
    await waitFor(() => expect(screen.getByTestId('builder')).toBeTruthy());
  });

  it('renders Referidos on the SAME range as the table, and moves it with the table', async () => {
    render(<AdminOrigenTab />);
    await waitFor(() => expect(screen.getByTestId('referidos').getAttribute('data-range')).toBe('30'));
    fireEvent.click(screen.getByRole('button', { name: 'range7' }));
    await waitFor(() => expect(screen.getByTestId('referidos').getAttribute('data-range')).toBe('7'));
    fireEvent.click(screen.getByRole('button', { name: 'rangeAll' }));
    await waitFor(() => expect(screen.getByTestId('referidos').getAttribute('data-range')).toBe('null'));
  });
});

