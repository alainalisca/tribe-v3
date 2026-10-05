import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TribeBroughtCard, { namesLine } from './TribeBroughtCard';

let flagOn = true;
const fetchTribeBrought = vi.fn();
vi.mock('@/lib/features/useAthleteValueFeature', () => ({ useAthleteValueFeature: () => flagOn }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/dal/tribeBrought', () => ({ fetchTribeBrought: (...a: unknown[]) => fetchTribeBrought(...a) }));

const DATA = {
  month: '2030-05',
  contacts: { count: 9, names: ['Ana', 'Carla', 'Eva', 'Feli', 'Gabo', 'Hugo', 'Iris', 'Juan', 'Kim'] },
  firstVisits: { count: 4, names: ['Ana', 'Eva', 'Feli', 'Gabo'] },
  cameBack: { count: 0, names: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  flagOn = true;
  fetchTribeBrought.mockResolvedValue({ success: true, data: DATA });
});

describe('TribeBroughtCard', () => {
  it('shows the title, the three counts and the first names', async () => {
    render(<TribeBroughtCard language="es" />);
    expect(await screen.findByText('Lo que Tribe te trajo este mes')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Ana, Eva, Feli, Gabo')).toBeInTheDocument();
  });

  it('caps the names and says how many more', async () => {
    render(<TribeBroughtCard language="es" />);
    expect(await screen.findByText('Ana, Carla, Eva, Feli, Gabo, Hugo y 3 más')).toBeInTheDocument();
  });

  it('a zero shows what to do, not an empty list', async () => {
    render(<TribeBroughtCard language="es" />);
    expect(await screen.findByText('Aún nadie este mes.')).toBeInTheDocument();
  });

  it('renders nothing, and asks nothing, with the flag off', async () => {
    flagOn = false;
    const { container } = render(<TribeBroughtCard language="es" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe('');
    expect(fetchTribeBrought).not.toHaveBeenCalled();
  });

  it('renders nothing when the read fails', async () => {
    fetchTribeBrought.mockResolvedValue({ success: false, error: 'not_instructor' });
    const { container } = render(<TribeBroughtCard language="es" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe('');
  });
});

describe('namesLine', () => {
  it('counts names the server did not send (a user with no name) in the remainder', () => {
    expect(namesLine({ count: 3, names: ['Ana'] }, 'en')).toBe('Ana and 2 more');
  });
});
