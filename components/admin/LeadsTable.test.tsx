/**
 * The leads table (T-LEAD2 part B).
 *
 * Asserts on the cells an admin acts on. The two that carry real cost if wrong
 * are the WhatsApp link (a bad href means a message to nobody, or worse, to
 * somebody else) and the Contactado toggle (a lead worked twice or never).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import LeadsTable, { type LeadRow } from './LeadsTable';

vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es' }) }));
vi.mock('@/lib/i18n/useTranslations', () => ({
  useTranslations: () => (key: string) =>
    ({
      colDate: 'Fecha',
      colPartner: 'Aliado',
      colName: 'Nombre',
      colWhatsapp: 'WhatsApp',
      colEmail: 'Email',
      colInterest: 'Interés',
      colPass: 'Pase',
      colSource: 'Llegó por',
      colNotified: 'Email enviado',
      colContacted: 'Contactado',
      colAccount: 'Cuenta',
      noSource: 'sin datos de origen',
      notSent: 'no se envió',
      accountYes: 'sí',
      empty: 'Todavía no hay leads.',
    })[key] ?? key,
}));

const ROW: LeadRow = {
  id: 'lead-1',
  created_at: '2026-09-18T18:42:00.000Z',
  name: 'Ana Gomez',
  whatsapp: '+573001112233',
  email: 'ana@example.com',
  choice_1: 'HYROX',
  choice_2: 'Mañana',
  pass_code: 'BB-4F7K',
  src: 'print',
  code: 'BULLBOX-01',
  notified_at: '2026-09-18T18:42:05.000Z',
  contacted_at: null,
  partnerName: 'CrossFit BullBox',
  hasTribeAccount: false,
};

function renderTable(row: Partial<LeadRow> = {}, props: Partial<React.ComponentProps<typeof LeadsTable>> = {}) {
  const onToggleContacted = vi.fn();
  const utils = render(
    <LeadsTable rows={[{ ...ROW, ...row }]} togglingId={null} onToggleContacted={onToggleContacted} {...props} />
  );
  return { ...utils, onToggleContacted };
}

describe('LeadsTable cells', () => {
  it('joins the two interest answers with a middot', () => {
    renderTable();
    expect(screen.getByText('HYROX · Mañana')).toBeTruthy();
  });

  it('omits the blank part rather than rendering a trailing separator', () => {
    // One answer must read "HYROX", never "HYROX · ".
    renderTable({ choice_2: null });
    expect(screen.getByText('HYROX')).toBeTruthy();
    expect(screen.queryByText(/HYROX ·/)).toBeNull();
  });

  it('shows src and code together in Llegó por', () => {
    renderTable();
    expect(screen.getByText('print · BULLBOX-01')).toBeTruthy();
  });

  it('says so in words when a lead has no attribution at all', () => {
    // Both of production's two leads are in this state today. An empty cell
    // here is indistinguishable from a rendering bug.
    renderTable({ src: null, code: null });
    expect(screen.getByText('sin datos de origen')).toBeTruthy();
  });

  it('renders a wa.me link with the plus stripped but displays the stored E.164', () => {
    renderTable();
    const link = screen.getByText('+573001112233').closest('a');
    // wa.me/+57... does not resolve. The digits go in the href, the readable
    // form stays in the cell so it can be checked against the row.
    expect(link!.getAttribute('href')).toBe('https://wa.me/573001112233');
    expect(link!.getAttribute('target')).toBe('_blank');
    expect(link!.getAttribute('rel')).toContain('noopener');
  });

  it('renders the email as a mailto', () => {
    renderTable();
    expect(screen.getByText('ana@example.com').closest('a')!.getAttribute('href')).toBe('mailto:ana@example.com');
  });

  /**
   * notified_at NULL is the signal that a lead survived an email failure and
   * needs chasing by hand -- the reason markPassLeadNotified is a separate
   * write from the insert. It has to be loud.
   */
  it('warns in words when the partner email never went out', () => {
    renderTable({ notified_at: null });
    expect(screen.getByText('no se envió')).toBeTruthy();
  });

  it('shows no warning when the email did go out', () => {
    renderTable();
    expect(screen.queryByText('no se envió')).toBeNull();
  });

  /**
   * showAccount is passed explicitly in both. Without it the column is not
   * rendered at all, and "expect no si" would pass against a table that COULD
   * NOT have shown one -- an assertion that cannot fail.
   */
  it('marks Cuenta only for a lead that has an account', () => {
    renderTable({ hasTribeAccount: true }, { showAccount: true });
    expect(screen.getByText('sí')).toBeTruthy();
  });

  it('leaves Cuenta blank rather than writing "no"', () => {
    renderTable({ hasTribeAccount: false }, { showAccount: true });
    expect(screen.queryByText('sí')).toBeNull();
    expect(screen.queryByText('no')).toBeNull();
  });
});

describe('LeadsTable contacted toggle', () => {
  it('reports the state the row is in', () => {
    const { rerender, onToggleContacted } = renderTable();
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
    rerender(
      <LeadsTable
        rows={[{ ...ROW, contacted_at: '2026-09-19T10:00:00.000Z' }]}
        togglingId={null}
        onToggleContacted={onToggleContacted}
      />
    );
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('asks for the OPPOSITE of the current state, so a toggle toggles', () => {
    const { onToggleContacted } = renderTable();
    fireEvent.click(screen.getByRole('switch'));
    expect(onToggleContacted).toHaveBeenCalledWith('lead-1', true);
  });

  it('asks to clear a lead that is already contacted', () => {
    const { onToggleContacted } = renderTable({ contacted_at: '2026-09-19T10:00:00.000Z' });
    fireEvent.click(screen.getByRole('switch'));
    expect(onToggleContacted).toHaveBeenCalledWith('lead-1', false);
  });

  it('cannot be fired twice while the first write is in flight', () => {
    const onToggleContacted = vi.fn();
    render(<LeadsTable rows={[ROW]} togglingId="lead-1" onToggleContacted={onToggleContacted} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onToggleContacted).not.toHaveBeenCalled();
  });
});

describe('LeadsTable columns by audience', () => {
  /**
   * The partner view must not show the Aliado column (there is only one, their
   * own) or the Cuenta column (it needs users.email, which no client role can
   * read, so a partner-side render could only ever show it blank -- which would
   * be a column that silently always says "not a member").
   */
  it('hides Aliado and Cuenta unless asked for them', () => {
    render(<LeadsTable rows={[ROW]} togglingId={null} onToggleContacted={vi.fn()} />);
    const header = within(screen.getAllByRole('row')[0]);
    expect(header.queryByText('Aliado')).toBeNull();
    expect(header.queryByText('Cuenta')).toBeNull();
    // The columns every audience gets are still there.
    expect(header.getByText('Fecha')).toBeTruthy();
    expect(header.getByText('Contactado')).toBeTruthy();
  });

  it('shows Aliado and Cuenta for the admin', () => {
    render(<LeadsTable rows={[ROW]} showPartner showAccount togglingId={null} onToggleContacted={vi.fn()} />);
    const header = within(screen.getAllByRole('row')[0]);
    expect(header.getByText('Aliado')).toBeTruthy();
    expect(header.getByText('Cuenta')).toBeTruthy();
  });

  it('keeps header and body cell counts in step in both modes', () => {
    // A column hidden in the header but not the body shifts every cell right,
    // which puts a WhatsApp number under the Email heading.
    for (const admin of [false, true]) {
      const { unmount } = render(
        <LeadsTable
          rows={[ROW]}
          showPartner={admin}
          showAccount={admin}
          togglingId={null}
          onToggleContacted={vi.fn()}
        />
      );
      const rows = screen.getAllByRole('row');
      expect(within(rows[1]).getAllByRole('cell')).toHaveLength(within(rows[0]).getAllByRole('columnheader').length);
      unmount();
    }
  });

  it('says the list is empty rather than rendering a headless table', () => {
    render(<LeadsTable rows={[]} togglingId={null} onToggleContacted={vi.fn()} />);
    expect(screen.getByText('Todavía no hay leads.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
