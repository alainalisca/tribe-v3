'use client';

import { useMemo } from 'react';
import MomentsUploader from '@/components/moments/MomentsUploader';
import type { MomentsApi } from '@/lib/moments/api';
import type { MomentItem, SessionMomentsState, TaggablePerson } from '@/lib/moments/types';

/** /dev/moments' client half: fixture photos from /public/site and an in-memory API that writes nothing. */
const PHOTOS = [
  'hero_full',
  'door_ath',
  'door_coach',
  'door_gym',
  'door_os',
  'essay_bb',
  'essay_zona',
  'essay_wil',
  'essay_yoga',
];
const SESSION = '00000000-0000-4000-8000-000000000001';
const people: TaggablePerson[] = [
  { kind: 'host', id: 'u-host', name: 'Salomon Tabares', avatarUrl: null },
  { kind: 'user', id: 'u-ana', name: 'Ana María Restrepo', avatarUrl: null },
  { kind: 'user', id: 'u-juan', name: 'Juan Pablo Gómez', avatarUrl: null },
  { kind: 'user', id: 'u-vale', name: 'Valentina Ríos', avatarUrl: null },
  { kind: 'guest', id: 'g-caro', name: 'Carolina', hasPhone: false },
  { kind: 'invite', id: 'i-mateo', name: 'Mateo', hasPhone: true, claimed: false },
];
const tag = (personId: string, name: string, kind: 'user' | 'invite' = 'user', delivered = false) => ({
  id: `t-${personId}-${Math.random().toString(36).slice(2, 7)}`,
  kind,
  personId,
  name,
  delivered,
  removed: false,
});
const media: MomentItem[] = PHOTOS.map((p, i) => ({
  id: `m-${i}`,
  gridUrl: `/site/${p}.jpg`,
  width: 1200,
  height: 900,
  uploaderId: 'u-al',
  createdAt: new Date(2026, 9, 18, 18, 30 + i).toISOString(),
  tags:
    i === 6
      ? [tag('u-ana', 'Ana María Restrepo')]
      : i === 7
        ? [tag('u-juan', 'Juan Pablo Gómez'), tag('i-mateo', 'Mateo', 'invite')]
        : i === 8
          ? [tag('u-vale', 'Valentina Ríos', 'user', true)]
          : [],
}));

export default function DevMomentsView({ picker }: { picker: 'list' | 'invite' | null }) {
  const initial: SessionMomentsState = { sessionId: SESSION, media, people };
  const api = useMemo<MomentsApi>(() => {
    let state = { ...initial, media: [...initial.media], people: [...initial.people] };
    const nameOf = (kind: string, id: string) =>
      state.people.find((p) => (p.kind === 'host' ? 'user' : p.kind) === kind && p.id === id)?.name ?? '';
    return {
      upload: async (blob, _takenAt, onProgress) => {
        for (let p = 0; p <= 1; p += 0.25) {
          onProgress(p);
          await new Promise((r) => setTimeout(r, 120));
        }
        const item: MomentItem = {
          id: `m-${Date.now()}`,
          gridUrl: URL.createObjectURL(blob),
          width: null,
          height: null,
          uploaderId: 'u-al',
          createdAt: new Date().toISOString(),
          tags: [],
        };
        state.media.push(item);
        return item;
      },
      tag: async (ids, targets, mode) => {
        state.media = state.media.map((m) => {
          if (!ids.includes(m.id)) return m;
          let tags = [...m.tags];
          for (const t of targets) {
            const kind = t.kind === 'guest' ? 'invite' : t.kind;
            if (mode === 'add' && !tags.some((x) => x.kind === kind && x.personId === t.id))
              tags.push(tag(t.id, nameOf(t.kind, t.id), kind));
            if (mode === 'remove') tags = tags.filter((x) => !(x.kind === kind && x.personId === t.id));
          }
          return { ...m, tags };
        });
        return state;
      },
      createInvite: async (name, phone) => {
        const p: TaggablePerson = { kind: 'invite', id: `i-${Date.now()}`, name, hasPhone: !!phone, claimed: false };
        state = { ...state, people: [...state.people, p] };
        return p;
      },
      deliver: async () => ({
        photos: 2,
        people: 3,
        invites: [
          {
            id: 'i-mateo',
            name: 'Mateo',
            phone: '+573001234567',
            count: 1,
            link: 'https://tribelatam.com/m/dev/',
            whatsappUrl: `https://wa.me/573001234567?text=${encodeURIComponent(
              'Te tomamos fotos en Boxeo con Salomon. Están aquí: https://tribelatam.com/m/dev/'
            )}`,
          },
        ],
      }),
      remove: async (id) => {
        state.media = state.media.filter((m) => m.id !== id);
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fixture api, built once
  }, []);
  return (
    <MomentsUploader
      sessionId={SESSION}
      sessionTitle="Boxeo con Salomon · sáb 18 oct"
      initial={initial}
      api={api}
      openPicker={picker}
    />
  );
}
