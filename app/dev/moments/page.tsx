import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { devFeedAllowed } from '../feed/devFeedAllowed';
import DevMomentsView from './DevMomentsView';
import DevPartCView, { type PartCView } from './DevPartCView';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import SiteLayout from '@/components/site/SiteLayout';
import CoachProfile from '@/components/site/pages/CoachProfile';
import { SITE_FONT_CLASS } from '@/lib/site/fonts';
import { renderStory } from '@/lib/moments/story';
import type { StripTile } from '@/lib/moments/coachStrip';

/**
 * /dev/moments (T-MOM1 Part B): the upload and tagging screen with fixture
 * photos and an in-memory API, for review. Nothing is read or written
 * anywhere. Local development only (the same guard as /dev/feed; middleware
 * also answers /dev/* with a 404 in production builds).
 *
 *   /dev/moments/                 the batch
 *   /dev/moments/?picker=list     with the tagging picker open
 *   /dev/moments/?picker=invite   with "Alguien que no está en Tribe" open
 *
 * Part C:
 *   /dev/moments/?view=momentos       a person's Momentos (two sessions)
 *   /dev/moments/?view=viewer         the viewer on the first photo
 *   /dev/moments/?view=viewer-sheet   the viewer with "Quitarme" open
 *   /dev/moments/?view=claim          /m/<token>/ as a signed-out visitor sees it
 *   /dev/moments/?view=claim-expired  an expired claim link
 *
 * Part D:
 *   /dev/moments/?view=viewer-toggle     the viewer with "Mostrar en la página de <coach>" on
 *   /dev/moments/?view=story-vertical    the story image of a vertical photo, at 390 px
 *   /dev/moments/?view=story-horizontal  the story image of a horizontal photo, at 390 px
 *   /dev/moments/?view=coach             a coach page with the Momentos strip
 */
const PART_C: PartCView[] = ['momentos', 'viewer', 'viewer-sheet', 'viewer-toggle', 'claim', 'claim-expired'];
const STORY_PHOTOS: Record<string, string> = { 'story-vertical': 'essay_yoga', 'story-horizontal': 'door_ath' };
const STRIP: StripTile[] = [
  ['essay_bb', 'Boxeo · 18 oct'],
  ['door_ath', 'Boxeo · 18 oct'],
  ['hero_full', 'Boxeo · 18 oct'],
  ['essay_zona', 'Funcional · 11 oct'],
  ['door_coach', 'Funcional · 11 oct'],
].map(([p, caption]) => ({ mediaId: p, gridUrl: `/site/${p}.jpg`, viewerUrl: `/site/${p}.jpg`, caption }));
export const metadata: Metadata = { title: 'Moments · Tribe dev', robots: { index: false, follow: false } };

export default async function DevMomentsPage({
  searchParams,
}: {
  searchParams: Promise<{ picker?: string; view?: string }>;
}) {
  if (!devFeedAllowed()) notFound();
  const { picker, view } = await searchParams;
  const partC = PART_C.find((v) => v === view);
  if (partC) return <DevPartCView view={partC} />;
  const storyPhoto = view ? STORY_PHOTOS[view] : undefined;
  if (storyPhoto) {
    const story = await renderStory({
      photo: await readFile(join(process.cwd(), 'public', 'site', `${storyPhoto}.jpg`)),
      coach: 'Salomon',
      gym: 'BullBox',
      lang: 'es',
    });
    return (
      <main style={{ background: '#d6d6d0', minHeight: '100vh', display: 'flex', justifyContent: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/jpeg;base64,${story.toString('base64')}`} alt="" width={390} height={693} />
      </main>
    );
  }
  if (view === 'coach')
    return (
      <SiteLayout lang="es" fontClassName={SITE_FONT_CLASS}>
        <CoachProfile
          lang="es"
          coach={{ name: 'Salomon Tabares', sports: ['Boxing'], bio: null, specialties: null }}
          gym="BullBox"
          photo={{ url: '/site/door_coach.jpg', x: 50, y: 35 }}
          sessions={[]}
          weekEnd="2026-10-25"
          momentos={STRIP}
        />
      </SiteLayout>
    );
  return <DevMomentsView picker={picker === 'list' || picker === 'invite' ? picker : null} />;
}
