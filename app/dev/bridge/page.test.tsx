import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import BridgeDevPage from './page';

/** T-JOIN1 Part A: the review page renders all four components, and is a 404 in production. */
afterEach(() => vi.unstubAllEnvs());

describe('/dev/bridge', () => {
  it('renders the poster, the rows, the day header and the ledger on both backgrounds', () => {
    render(<BridgeDevPage />);
    expect(screen.getAllByText('Yoga con Neera')).toHaveLength(2);
    expect(screen.getAllByText('Sáb 25')).toHaveLength(2);
    expect(screen.getAllByText('Cuándo')).toHaveLength(2);
    expect(screen.getAllByRole('link').length).toBeGreaterThanOrEqual(6);
  });

  it('is a 404 in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => BridgeDevPage()).toThrow();
  });
});
