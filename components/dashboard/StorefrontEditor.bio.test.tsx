import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Issue 2. This editor showed ONE textarea labelled just "Bio" / "Biografía",
 * prefilled it from `instructor_bio || bio`, and saved it to `instructor_bio`
 * alone. An instructor editing "their bio" here therefore copied users.bio into
 * users.instructor_bio and left users.bio stale -- and users.bio is what
 * /profile/[userId] and /search still display. That was a live divergence
 * mechanism, not just legacy data.
 *
 * WRITING BOTH COLUMNS LOOKED LIKE THE SAFE FIX AND WAS THE DESTRUCTIVE ONE.
 * The prefill resolves to `instructor_bio || bio`. For the instructor whose
 * `bio` is English and whose `instructor_bio` is Spanish, that is the Spanish
 * -- so her first storefront save would have written Spanish into `bio` and her
 * English bio would be gone. Silently, with text still in the field. Three of
 * ten instructors use the pair as two genuinely different texts.
 *
 * So: one control, one column. The label names it, the prefill reads only the
 * column it owns, and the display fallback is EXPLAINED rather than prefilled.
 */

const { mockUpdate } = vi.hoisted(() => ({ mockUpdate: vi.fn() }));

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ storage: { from: () => ({}) } }) }));
vi.mock('@/lib/dal/instructorDashboard', () => ({
  updateStorefrontProfile: (...a: unknown[]) => mockUpdate(...a),
}));
vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => <img alt={String(p.alt ?? '')} /> }));
vi.mock('next/link', () => ({ default: (p: { children?: unknown }) => <a>{p.children as never}</a> }));
vi.mock('@/components/ui/button', () => ({
  Button: (p: Record<string, unknown>) => <button {...(p as object)} />,
}));
vi.mock('@/components/dashboard/VideoUploadSection', () => ({ default: () => <div /> }));

import StorefrontEditor from './StorefrontEditor';

const FALLBACK_NOTE = /Your short bio is showing here for now/;

function mount(over: Record<string, unknown> = {}) {
  render(
    <StorefrontEditor
      userId="u1"
      language="en"
      initialBio=""
      initialShortBio=""
      initialTagline="t"
      initialSports={[]}
      initialSpecialties={[]}
      initialBannerUrl=""
      {...(over as object)}
    />
  );
}

function bioBox(): HTMLTextAreaElement {
  return screen.getByPlaceholderText(
    'Your experience, your approach, why someone should train with you'
  ) as HTMLTextAreaElement;
}

async function save() {
  fireEvent.click(await screen.findByText('Save Changes'));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
  return mockUpdate.mock.calls[0][2] as Record<string, unknown>;
}

describe('StorefrontEditor owns instructor_bio and only instructor_bio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({ success: true });
  });

  it('never writes users.bio, whatever is in the box', async () => {
    mount({ initialBio: 'storefront pitch', initialShortBio: 'the short one' });
    fireEvent.change(bioBox(), { target: { value: 'a new pitch' } });

    const payload = await save();
    expect(payload.instructor_bio).toBe('a new pitch');
    expect(payload).not.toHaveProperty('bio');
  });

  it('the Neera case: saving the storefront cannot touch her English bio', async () => {
    // bio English, instructor_bio Spanish. This is the case that made "write
    // both" destructive, so it is asserted directly rather than by implication.
    mount({ initialBio: 'Soy instructora de yoga.', initialShortBio: 'I am a yoga instructor.' });
    expect(bioBox().value).toBe('Soy instructora de yoga.');

    const payload = await save();
    expect(payload).not.toHaveProperty('bio');
    expect(payload.instructor_bio).toBe('Soy instructora de yoga.');
  });

  it('prefills from instructor_bio only, never from bio', async () => {
    // The old prefill was `instructor_bio || bio`. With instructor_bio empty it
    // put users.bio in the box, and saving then copied it across.
    mount({ initialBio: '', initialShortBio: 'MUST-NOT-BE-PREFILLED' });
    expect(bioBox().value).toBe('');
  });

  it('explains the display fallback instead of prefilling it', async () => {
    // The five read paths still fall back to `instructor_bio || bio`, so the
    // storefront shows text while this box is blank. Saying so is honest.
    mount({ initialBio: '', initialShortBio: 'the short one' });
    expect(screen.queryByText(FALLBACK_NOTE)).not.toBeNull();
  });

  it('saving with the note showing still writes nothing to bio', async () => {
    mount({ initialBio: '', initialShortBio: 'the short one' });

    const payload = await save();
    expect(payload).not.toHaveProperty('bio');
    expect(payload.instructor_bio).toBe('');
  });

  it('hides the note once a storefront bio exists', async () => {
    mount({ initialBio: 'a pitch', initialShortBio: 'the short one' });
    expect(screen.queryByText(FALLBACK_NOTE)).toBeNull();
  });

  it('hides the note when there is no short bio to fall back to', async () => {
    // Nothing is being displayed in place of the storefront bio, so there is
    // nothing to explain and the note would be a lie.
    mount({ initialBio: '', initialShortBio: '' });
    expect(screen.queryByText(FALLBACK_NOTE)).toBeNull();
  });

  it('labels the field by the column it owns', async () => {
    mount();
    expect(screen.queryByText(/Storefront bio/)).not.toBeNull();
    expect(screen.queryByText(/where athletes decide to book/)).not.toBeNull();
  });
});
