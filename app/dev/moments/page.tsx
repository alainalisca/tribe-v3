import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { devFeedAllowed } from '../feed/devFeedAllowed';
import DevMomentsView from './DevMomentsView';
import DevPartCView, { type PartCView } from './DevPartCView';

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
 */
const PART_C: PartCView[] = ['momentos', 'viewer', 'viewer-sheet', 'claim', 'claim-expired'];
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
  return <DevMomentsView picker={picker === 'list' || picker === 'invite' ? picker : null} />;
}
