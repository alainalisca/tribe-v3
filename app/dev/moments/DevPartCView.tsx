'use client';

import { useMemo } from 'react';
import ClaimView from '@/components/moments/ClaimView';
import MyMomentos from '@/components/moments/MyMomentos';
import type { MyMomentsApi } from '@/lib/moments/myApi';
import type { MyMomentsBatch } from '@/lib/moments/types';
import type { Fixture, FixturePhotos } from './fixtureNames';

/**
 * /dev/moments' Part C screens with fixture photos (dev/fixtures/moments) and an
 * in-memory API that writes nothing: Momentos, the viewer (and its "Quitarme"
 * sheet), and the claim link as a signed-out visitor sees it.
 */
export type PartCView = 'momentos' | 'viewer' | 'viewer-sheet' | 'viewer-toggle' | 'claim' | 'claim-expired';

const S1 = '00000000-0000-4000-8000-000000000001';
const S2 = '00000000-0000-4000-8000-000000000002';
const photoOf = (photos: FixturePhotos) => (name: Fixture, i: number) => ({
  mediaId: `m-${name}-${i}`,
  gridUrl: photos[name],
  viewerUrl: photos[name],
  width: 1200,
  height: 900,
  thanked: false,
  onCoachPage: false,
});
const batchesFor = (photos: FixturePhotos): MyMomentsBatch[] => [
  {
    sessionId: S1,
    title: null,
    sport: 'Boxing',
    date: '2026-10-18',
    coachName: 'Salomon Tabares',
    photos: (
      ['essay_bb', 'hero_full', 'door_ath', 'door_coach', 'essay_zona', 'essay_wil', 'door_gym', 'door_os'] as Fixture[]
    ).map(photoOf(photos)),
  },
  {
    sessionId: S2,
    title: 'Yoga al parque',
    sport: 'Yoga',
    date: '2026-10-11',
    coachName: 'Valentina Ríos',
    photos: (['essay_yoga', 'door_ath', 'essay_zona'] as Fixture[]).map(photoOf(photos)),
  },
];

export default function DevPartCView({ view, photos }: { view: PartCView; photos: FixturePhotos }) {
  const batches = useMemo(() => batchesFor(photos), [photos]);
  const api = useMemo<MyMomentsApi>(
    () => ({
      load: async () => batches,
      download: async () => photos.essay_bb,
      thanks: async () => undefined,
      remove: async () => ({ requested: true }),
      story: async () => (await fetch(photos.essay_bb)).blob(),
      setCoachPage: async () => undefined,
    }),
    [batches, photos]
  );
  if (view === 'claim')
    return (
      <ClaimView
        state={{
          kind: 'ok',
          cta: '/auth/?signup=1&returnTo=%2Fm%2Fdev%2Fclaim%2F',
          preview: {
            name: 'Mateo',
            session: { id: S1, title: null, sport: 'Boxing', date: '2026-10-18', photo: photos.hero_full },
            coachName: 'Salomon Tabares',
            count: 6,
            firstUrl: photos.essay_bb,
            tiles: (['door_ath', 'door_coach', 'essay_zona', 'essay_wil', 'door_gym'] as Fixture[]).map((p) => photos[p]),
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
