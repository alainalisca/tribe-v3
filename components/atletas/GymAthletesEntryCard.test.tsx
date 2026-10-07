/**
 * T-AV26 (Al's decision 5): the gym owner's card on /dashboard/partner shows
 * only with the athletes flag on AND a program row (without one the dashboard
 * is a 404). Mutation proof: drop the `hasProgram` check -> "flag on, no
 * program: nothing" goes red.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ fetch: vi.fn(), hasProgram: vi.fn() }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es' }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/dal/athleteGym', () => ({ hasAthleteProgram: h.hasProgram }));

import GymAthletesEntryCard from './GymAthletesEntryCard';

const P = '00000000-0000-4000-8000-000000007000';
const flag = (enabled: boolean) => ({ ok: true, json: async () => ({ enabled }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', h.fetch);
});

describe('GymAthletesEntryCard', () => {
  it('flag on and a program: a link to the dashboard titled "Atletas Tribe"', async () => {
    h.fetch.mockResolvedValue(flag(true));
    h.hasProgram.mockResolvedValue(true);
    const { container } = render(<GymAthletesEntryCard partnerId={P} />);
    await waitFor(() => expect(container.querySelector('[data-gym-athletes-entry]')).toBeTruthy());
    const a = container.querySelector('[data-gym-athletes-entry]');
    expect(a?.getAttribute('href')?.replace(/\/$/, '')).toBe(`/atletas/gym/${P}`);
    expect(a?.textContent).toBe('Atletas Tribe');
    expect(h.fetch).toHaveBeenCalledWith('/api/features/athlete-value/?feature=athletes', { cache: 'no-store' });
    expect(h.hasProgram).toHaveBeenCalledWith(expect.anything(), P);
  });

  it('flag on, no program: nothing', async () => {
    h.fetch.mockResolvedValue(flag(true));
    h.hasProgram.mockResolvedValue(false);
    const { container } = render(<GymAthletesEntryCard partnerId={P} />);
    await waitFor(() => expect(h.hasProgram).toHaveBeenCalled());
    expect(container.querySelector('[data-gym-athletes-entry]')).toBeNull();
  });

  it('flag off or an error: nothing, and the program is never asked', async () => {
    h.fetch.mockResolvedValue(flag(false));
    const off = render(<GymAthletesEntryCard partnerId={P} />);
    await waitFor(() => expect(h.fetch).toHaveBeenCalled());
    expect(off.container.querySelector('[data-gym-athletes-entry]')).toBeNull();
    off.unmount();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.fetch.mockRejectedValue(new Error('offline'));
    const err = render(<GymAthletesEntryCard partnerId={P} />);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(err.container.querySelector('[data-gym-athletes-entry]')).toBeNull();
    expect(h.hasProgram).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
