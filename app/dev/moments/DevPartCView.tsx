'use client';

import { useMemo } from 'react';
import ClaimView from '@/components/moments/ClaimView';
import MyMomentos from '@/components/moments/MyMomentos';
import type { MyMomentsApi } from '@/lib/moments/myApi';
import type { MyMomentsBatch } from '@/lib/moments/types';

/**
 * /dev/moments' Part C screens with fixture photos from /public/site and an
 * in-memory API that writes nothing: Momentos, the viewer (and its "Quitarme"
 * sheet), and the claim link as a signed-out visitor sees it.
 */
export type PartCView = 'momentos' | 'viewer' | 'viewer-sheet' | 'viewer-toggle' | 'claim' | 'claim-expired';

const S1 = '00000000-0000-4000-8000-000000000001';
const S2 = '00000000-0000-4000-8000-000000000002';
const photo = (name: string, i: number) => ({
  mediaId: `m-${name}-${i}`,
  gridUrl: `/site/${name}.jpg`,
  viewerUrl: `/site/${name}.jpg`,
  width: 1200,
  height: 900,
  thanked: false,
  onCoachPage: false,
});
const batches: MyMomentsBatch[] = [
  {
    sessionId: S1,
    title: null,
    sport: 'Boxing',
    date: '2026-10-18',
    coachName: 'Salomon Tabares',
    photos: ['essay_bb', 'hero_full', 'door_ath', 'door_coach', 'essay_zona', 'essay_wil', 'door_gym', 'door_os'].map(
      photo
    ),
  },
  {
    sessionId: S2,
    title: 'Yoga al parque',
    sport: 'Yoga',
    date: '2026-10-11',
    coachName: 'Valentina Ríos',
    photos: ['essay_yoga', 'door_ath', 'essay_zona'].map(photo),
  },
];

export default function DevPartCView({ view }: { view: PartCView }) {
  const api = useMemo<MyMomentsApi>(
    () => ({
      load: async () => batches,
      download: async () => '/site/essay_bb.jpg',
      thanks: async () => undefined,
      remove: async () => ({ requested: true }),
      story: async () => (await fetch('/site/essay_bb.jpg')).blob(),
      setCoachPage: async () => undefined,
    }),
    []
  );
  if (view === 'claim')
    return (
      <ClaimView
        state={{
          kind: 'ok',
          cta: '/auth/?signup=1&returnTo=%2Fm%2Fdev%2Fclaim%2F',
          preview: {
            name: 'Mateo',
            session: { id: S1, title: null, sport: 'Boxing', date: '2026-10-18', photo: '/site/hero_full.jpg' },
            coachName: 'Salomon Tabares',
            count: 6,
            firstUrl: '/site/essay_bb.jpg',
            tiles: ['door_ath', 'door_coach', 'essay_zona', 'essay_wil', 'door_gym'].map((p) => `/site/${p}.jpg`),
          },
        }}
      />
    );
  if (view === 'claim-expired') return <ClaimView state={{ kind: 'expired' }} />;
  return (
    <MyMomentos
      initial={batches}
      api={api}
      initialViewer={
        view === 'momentos'
          ? null
          : { sessionId: view === 'viewer-toggle' ? S2 : S1, index: 0, sheet: view === 'viewer-sheet' }
      }
    />
  );
}
