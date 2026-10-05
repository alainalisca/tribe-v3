import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import FirstTimerBlock from './FirstTimerBlock';

let flagOn = true;
const fetchFirstTimerBlock = vi.fn();
vi.mock('@/lib/features/useAthleteValueFeature', () => ({ useAthleteValueFeature: () => flagOn }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }));
vi.mock('@/lib/dal/firstTimer', () => ({ fetchFirstTimerBlock: (...a: unknown[]) => fetchFirstTimerBlock(...a) }));

beforeEach(() => {
  vi.clearAllMocks();
  flagOn = true;
  fetchFirstTimerBlock.mockResolvedValue({
    success: true,
    data: { coachFirstName: 'Salomón', text: 'Llega 10 minutos antes.' },
  });
});

describe('FirstTimerBlock', () => {
  it('shows "Tu primera vez con {coach}" and the coach text', async () => {
    render(<FirstTimerBlock sessionId="s1" language="es" />);
    expect(await screen.findByText('Tu primera vez con Salomón')).toBeInTheDocument();
    expect(screen.getByText('Llega 10 minutos antes.')).toBeInTheDocument();
    expect(fetchFirstTimerBlock).toHaveBeenCalledWith({}, 's1');
  });

  it('shows nothing when the server says this viewer is not a first-timer', async () => {
    fetchFirstTimerBlock.mockResolvedValue({ success: true, data: null });
    const { container } = render(<FirstTimerBlock sessionId="s1" language="es" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe('');
  });

  it('shows nothing, and asks nothing, with the flag off', async () => {
    flagOn = false;
    const { container } = render(<FirstTimerBlock sessionId="s1" language="es" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe('');
    expect(fetchFirstTimerBlock).not.toHaveBeenCalled();
  });
});
