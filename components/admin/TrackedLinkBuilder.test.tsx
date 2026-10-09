import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * The tracked link builder (T-GROW1 part G).
 *
 * lib/growth/trackedLink.test.ts already covers the URL building and the code
 * judgement as pure functions, including the property that matters most: every
 * tag this builder mints survives the capture path unchanged. So this file is
 * only about what the COMPONENT adds on top, and there are three things:
 *
 *   1. THE TWO HINTS CARRY DIFFERENT WEIGHT. "This code cannot be tracked" is
 *      the one that costs a printed poster, so it is the warning colour; the
 *      convention note is grey. A component that showed them identically would
 *      train Al to ignore both.
 *   2. NO LINK IS OFFERED when the destination is incomplete, rather than a
 *      link to the wrong place -- /pase/ is the catalogue page, which WORKS, so
 *      nobody would notice until the leads failed to arrive.
 *   3. THE QR REQUEST ASKS FOR THE BUILT LINK, not for the raw field values.
 *      The preview, the clipboard and the QR have to be the same string, or the
 *      poster and the report disagree.
 */

vi.mock('@/lib/i18n/useTranslations', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn(), showInfo: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logError: vi.fn(), log: vi.fn() }));

import TrackedLinkBuilder from './TrackedLinkBuilder';
import { showError } from '@/lib/toast';

/**
 * The origin every built link MUST carry: the product's canonical address.
 *
 * Written as a LITERAL rather than imported from lib/http/siteUrl, on purpose.
 * Importing SITE_URL would make every assertion below tautological -- the test
 * would agree with the module whatever the module said, including if someone
 * set the canonical domain to a typo. A literal is the only thing here that
 * can disagree.
 */
const ORIGIN = 'https://tribelatam.com';

/**
 * A DECOY browser origin, stubbed into window.location on every test.
 *
 * T-DOMAIN1: the component used to read `window.location.origin`, so an admin
 * building a link while looking at a Vercel preview got a preview URL -- one
 * that stops resolving when that deployment is pruned -- and printed it on a
 * poster. The decoy is what makes these tests able to SEE that: with the stub
 * set to the real canonical domain they would pass either way, which is how
 * the old behaviour went unnoticed. Every assertion on ORIGIN below is now
 * also an assertion that the browser's origin was ignored.
 */
const DECOY_BROWSER_ORIGIN = 'https://tribe-v3-git-some-preview-branch.vercel.app';

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { origin: DECOY_BROWSER_ORIGIN } as Location,
  });
});

describe('TrackedLinkBuilder', () => {
  it('offers NO link until the destination is complete', () => {
    render(<TrackedLinkBuilder />);
    // Default destination is `pase` with an empty slug. /pase/ is the CATALOGUE
    // page, so a link built anyway would work and silently track nothing.
    expect(screen.getByText('incomplete')).toBeTruthy();
    expect(screen.queryByText(new RegExp(ORIGIN))).toBeNull();
  });

  it('builds and previews the link once the destination is there', () => {
    render(<TrackedLinkBuilder />);
    type('targetPase', 'bullbox');
    type('fieldSrc', 'ig');
    type('fieldCode', 'IG-REEL-01');
    type('fieldCampaign', 'hyrox-oct');
    expect(screen.getByText(`${ORIGIN}/pase/bullbox/?src=ig&code=IG-REEL-01&utm_campaign=hyrox-oct`)).toBeTruthy();
    expect(screen.queryByText('incomplete')).toBeNull();
  });

  it('normalises casing in the PREVIEW, so what is printed is what is stored', () => {
    render(<TrackedLinkBuilder />);
    type('targetPase', 'bullbox');
    type('fieldSrc', 'RunClub');
    type('fieldCode', 'runclub-sat0927');
    // The preview is the built link, not an echo of the fields. If it showed the
    // typed text the poster would carry one spelling and the row another.
    expect(screen.getByText(`${ORIGIN}/pase/bullbox/?src=runclub&code=RUNCLUB-SAT0927`)).toBeTruthy();
  });

  it('hides the target field for the home destination rather than disabling it', () => {
    render(<TrackedLinkBuilder />);
    fireEvent.change(screen.getByLabelText('builderDestination'), { target: { value: 'home' } });
    // A disabled input that can never apply is a control the reader has to work
    // out the irrelevance of.
    expect(screen.queryByLabelText('targetPase')).toBeNull();
    expect(screen.getByText(`${ORIGIN}/`)).toBeTruthy();
  });

  it('warns LOUDLY about a code the capture path would drop', () => {
    render(<TrackedLinkBuilder />);
    type('targetPase', 'bullbox');
    type('fieldCode', 'IG REEL 01');
    const hint = screen.getByText('hintUncapturable');
    // The warning colour, because this is the hint that costs a printed poster.
    expect(hint.className).toContain('orange');
    expect(screen.queryByText('hintUnconventional')).toBeNull();
    // And the link still builds, with the unusable code OMITTED rather than
    // mangled, so its absence is visible in the preview.
    expect(screen.getByText(`${ORIGIN}/pase/bullbox/`)).toBeTruthy();
  });

  it('mentions the convention QUIETLY for a usable but off-convention code', () => {
    render(<TrackedLinkBuilder />);
    type('targetPase', 'bullbox');
    type('fieldCode', 'OPENDAY');
    const hint = screen.getByText('hintUnconventional');
    // Grey, not orange: advisory. A builder that refused anything off-convention
    // would be wrong the first time Al needs a code nobody anticipated.
    expect(hint.className).not.toContain('orange');
    expect(screen.queryByText('hintUncapturable')).toBeNull();
    expect(screen.getByText(`${ORIGIN}/pase/bullbox/?code=OPENDAY`)).toBeTruthy();
  });

  it('shows no hint at all for a conventional code or an empty field', () => {
    render(<TrackedLinkBuilder />);
    type('targetPase', 'bullbox');
    expect(screen.queryByText('hintUncapturable')).toBeNull();
    expect(screen.queryByText('hintUnconventional')).toBeNull();
    type('fieldCode', 'RUNCLUB-SAT0927');
    expect(screen.queryByText('hintUncapturable')).toBeNull();
    expect(screen.queryByText('hintUnconventional')).toBeNull();
  });

  it('copies the BUILT link and reports a clipboard refusal rather than faking success', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    render(<TrackedLinkBuilder />);
    type('targetPase', 'bullbox');
    type('fieldSrc', 'ig');
    fireEvent.click(screen.getByRole('button', { name: /copyLink/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${ORIGIN}/pase/bullbox/?src=ig`));
    await waitFor(() => expect(screen.getByRole('button', { name: /copied/ })).toBeTruthy());

    // An iOS webview without clipboard permission, or an insecure origin. The
    // link is on screen and selectable, so the message says to copy it by hand
    // rather than showing "Copiado" over an action that did not happen.
    writeText.mockRejectedValueOnce(new Error('denied'));
    fireEvent.click(screen.getByRole('button', { name: /copied|copyLink/ }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('copyError'));
  });

  it('asks the QR endpoint for the BUILT link, url-encoded', async () => {
    // The parameter is declared so the mock's call tuple HAS an index 0 to read.
    // An inline `vi.fn(async () => ...)` infers a zero-arity signature, and
    // calls[0][0] is then a tsc error rather than a runtime surprise -- which is
    // the typecheck doing its job on a test that reads its own mock's arguments.
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL) => ({ ok: true, text: async () => '<svg></svg>' }) as unknown as Response
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<TrackedLinkBuilder />);
    type('targetPase', 'bullbox');
    type('fieldSrc', 'ig');
    type('fieldCode', 'IG-REEL-01');
    fireEvent.click(screen.getByRole('button', { name: /downloadQr/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/api/admin/qr?url=');
    // The same string as the preview and the clipboard. Three places showing two
    // different links is how a poster ends up untracked.
    expect(decodeURIComponent(url.split('url=')[1])).toBe(`${ORIGIN}/pase/bullbox/?src=ig&code=IG-REEL-01`);
  });

  it('reports a QR failure instead of downloading nothing silently', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 400 }) as unknown as Response)
    );
    render(<TrackedLinkBuilder />);
    type('targetPase', 'bullbox');
    fireEvent.click(screen.getByRole('button', { name: /downloadQr/ }));
    // A button that appears to do nothing is the worst outcome: Al would assume
    // the QR downloaded and go looking for it.
    await waitFor(() => expect(showError).toHaveBeenCalledWith('qrError'));
  });
});
