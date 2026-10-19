import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ language: 'es', t: (k: string) => k }) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

import MomentsUploader from './MomentsUploader';
import type { MomentsApi } from '@/lib/moments/api';
import type { SessionMomentsState, TagTarget } from '@/lib/moments/types';

/** T-MOM1 Part B: select several photos, "Etiquetar a" once, then "Entregar". The API is a stand-in. */
const initial: SessionMomentsState = {
  sessionId: 's1',
  people: [
    { kind: 'host', id: 'h', name: 'Salomon', avatarUrl: null },
    { kind: 'user', id: 'a', name: 'Ana', avatarUrl: null },
  ],
  media: ['m1', 'm2', 'm3'].map((id) => ({
    id,
    gridUrl: null,
    width: 10,
    height: 10,
    uploaderId: 'x',
    createdAt: '',
    tags: [],
  })),
};

function api(): MomentsApi {
  return {
    upload: vi.fn(),
    tag: vi.fn(async (ids: string[], targets: TagTarget[]) => ({
      ...initial,
      media: initial.media.map((m) =>
        ids.includes(m.id)
          ? {
              ...m,
              tags: targets.map((t) => ({
                id: `${m.id}-${t.id}`,
                kind: 'user' as const,
                personId: t.id,
                name: 'Ana',
                delivered: false,
                removed: false,
              })),
            }
          : m
      ),
    })),
    createInvite: vi.fn(),
    deliver: vi.fn(async () => ({ photos: 2, people: 1, invites: [] })),
    remove: vi.fn(),
  };
}

describe('MomentsUploader', () => {
  it('everything starts under "Sin etiquetar", and nothing can be delivered yet', () => {
    render(<MomentsUploader sessionId="s1" sessionTitle="Boxeo con Salomon" initial={initial} api={api()} />);
    expect(screen.getByRole('heading', { name: /Sin etiquetar/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Entregar/ })).toBeDisabled();
  });

  it('two photos, "Etiquetar a" once, check Ana, "Listo": one tag call for both photos; then one delivery', async () => {
    const a = api();
    render(<MomentsUploader sessionId="s1" sessionTitle="Boxeo con Salomon" initial={initial} api={a} />);
    const tiles = screen
      .getAllByRole('button', { pressed: false })
      .filter((b) => b.getAttribute('aria-label') === 'Sin etiquetar');
    fireEvent.click(tiles[0]);
    fireEvent.click(tiles[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Etiquetar a (2)' }));
    const picker = await screen.findByTestId('tag-picker');
    fireEvent.click(within(picker).getByRole('checkbox', { name: /Ana/ }));
    fireEvent.click(within(picker).getByRole('button', { name: 'Listo' }));
    await waitFor(() => expect(a.tag).toHaveBeenCalledTimes(1));
    expect(a.tag).toHaveBeenCalledWith(['m1', 'm2'], [{ kind: 'user', id: 'a' }], 'add');

    const deliver = await screen.findByRole('button', { name: /^Entregar · 1 personas/ });
    fireEvent.click(deliver);
    await waitFor(() => expect(a.deliver).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Entregadas: 2 fotos a 1 personas')).toBeInTheDocument();
  });
});
