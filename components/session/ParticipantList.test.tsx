import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es', t: (k: string) => k }) }));

import ParticipantList from './ParticipantList';

/** T-UI-SD1: the host sits above the list as "Anfitrión", never counted or listed as an athlete. */
const creator = {
  id: 'h1',
  name: 'Salomon Tabares Adarve',
  avatar_url: null,
  average_rating: null,
  total_reviews: null,
};
const athlete = (id: string, name: string) => ({
  user_id: id,
  status: 'confirmed',
  user: { id, name, avatar_url: null },
});

function list(participants: ReturnType<typeof athlete>[]) {
  render(
    <ParticipantList
      creator={creator}
      creatorId="h1"
      participants={participants}
      canKick={false}
      language="es"
      onKickUser={vi.fn()}
    />
  );
}

describe('ParticipantList', () => {
  it('no athletes: the host above as Anfitrión (full name), "Atletas (0)", an empty line', () => {
    list([]);
    const host = screen.getByTestId('session-host');
    expect(within(host).getByText('Anfitrión')).toBeInTheDocument();
    expect(within(host).getByText('Salomon Tabares Adarve')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Atletas (0)' })).toBeInTheDocument();
    expect(screen.getByText('Aún no hay atletas.')).toBeInTheDocument();
  });

  it('counts and lists athletes only, even when the host has a participant row', () => {
    list([athlete('h1', 'Salomon Tabares Adarve'), athlete('a1', 'Ana'), athlete('a2', 'Leo')]);
    expect(screen.getByRole('heading', { name: 'Atletas (2)' })).toBeInTheDocument();
    expect(screen.getAllByText('Salomon Tabares Adarve')).toHaveLength(1);
    expect(screen.queryByText('Aún no hay atletas.')).not.toBeInTheDocument();
  });
});
