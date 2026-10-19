import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { devFeedAllowed } from '../feed/devFeedAllowed';
import DevMomentsView from './DevMomentsView';

/**
 * /dev/moments (T-MOM1 Part B): the upload and tagging screen with fixture
 * photos and an in-memory API, for review. Nothing is read or written
 * anywhere. Local development only (the same guard as /dev/feed; middleware
 * also answers /dev/* with a 404 in production builds).
 *
 *   /dev/moments/                 the batch
 *   /dev/moments/?picker=list     with the tagging picker open
 *   /dev/moments/?picker=invite   with "Alguien que no está en Tribe" open
 */
export const metadata: Metadata = { title: 'Moments · Tribe dev', robots: { index: false, follow: false } };

export default async function DevMomentsPage({ searchParams }: { searchParams: Promise<{ picker?: string }> }) {
  if (!devFeedAllowed()) notFound();
  const { picker } = await searchParams;
  return <DevMomentsView picker={picker === 'list' || picker === 'invite' ? picker : null} />;
}
