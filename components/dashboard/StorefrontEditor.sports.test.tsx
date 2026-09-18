import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Issue 1: the storefront editor had one bare comma-separated box labelled
 * "Specialties (Comma separated)" whose placeholder read 'Yoga, HIIT, Crossfit'
 * -- three sport names, one of them misspelled against the canonical list. It
 * did not permit free-text sport names, it demonstrated them, and it is where
 * most of the ones in production came from. Jonathan's stored 'Crossfit' is
 * that placeholder's spelling, and it is why the CrossFit chip never found him.
 *
 * The editor now has a canonical chip row writing users.sports alongside the
 * free-text box writing users.specialties. These tests assert the destination
 * of each control and that the placeholder names no sport, because the
 * placeholder is the root cause rather than a cosmetic detail.
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
import { SPORTS_LIST } from '@/lib/sports';

function mount(over: Partial<Parameters<typeof StorefrontEditor>[0]> = {}) {
  render(
    <StorefrontEditor
      userId="u1"
      language="en"
      initialBio="b"
      initialShortBio=""
      initialTagline="t"
      initialSports={[]}
      initialSpecialties={[]}
      initialBannerUrl=""
      {...over}
    />
  );
}

async function save() {
  fireEvent.click(await screen.findByText('Save Changes'));
  await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
  return mockUpdate.mock.calls[0][2] as Record<string, unknown>;
}

describe('StorefrontEditor separates sports from specialties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue({ success: true });
  });

  it('a chip lands in sports', async () => {
    mount();
    fireEvent.click(await screen.findByText('Boxing'));

    const payload = await save();
    expect(payload.sports).toEqual(['Boxing']);
    expect(payload.specialties).toEqual([]);
  });

  it('the free-text box lands in specialties', async () => {
    mount();
    const box = await screen.findByPlaceholderText('Sound healing, prenatal, competition prep');
    fireEvent.change(box, { target: { value: 'Sound healing, prenatal' } });

    const payload = await save();
    expect(payload.specialties).toEqual(['Sound healing', 'prenatal']);
    expect(payload.sports).toEqual([]);
  });

  it('prefills and preserves existing sports, so saving the bio cannot clear them', async () => {
    // updateStorefrontProfile PATCHes users, so a `sports` key built from empty
    // state would blank a column the instructor set on another screen.
    mount({ initialSports: ['CrossFit', 'HYROX'], initialSpecialties: ['Powerlifting'] });

    const payload = await save();
    expect(payload.sports).toEqual(['CrossFit', 'HYROX']);
    expect(payload.specialties).toEqual(['Powerlifting']);
  });

  it('the specialties placeholder names no sport', async () => {
    // The root cause. 'Yoga, HIIT, Crossfit' taught instructors to type sport
    // names into free text, with a spelling that does not match the canonical
    // list -- and a variant of it is sitting in production today.
    mount();
    const box = (await screen.findByPlaceholderText('Sound healing, prenatal, competition prep')) as HTMLInputElement;

    const named = (SPORTS_LIST as readonly string[]).filter((s) =>
      box.placeholder.toLowerCase().includes(s.toLowerCase())
    );
    expect(named, `the placeholder names ${named.join(', ')}`).toEqual([]);
  });

  it('offers every canonical sport except Other as a chip', async () => {
    mount();
    await screen.findByText('Yoga');
    for (const sport of SPORTS_LIST) {
      if (sport === 'Other') continue;
      expect(screen.queryByText(sport), `${sport} should be offered`).not.toBeNull();
    }
    expect(screen.queryByText('Other')).toBeNull();
  });
});
