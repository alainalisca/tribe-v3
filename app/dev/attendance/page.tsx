import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { devFeedAllowed } from '../feed/devFeedAllowed';
import DevAttendanceView from './DevAttendanceView';

/**
 * /dev/attendance (T-AV2b): the host's attendance card with fixture people and
 * an in-memory source, for review. Nothing is read or written anywhere. Local
 * development only (the same guard as /dev/feed; middleware answers /dev/*
 * with a 404 in production builds).
 *
 *   /dev/attendance/            the T-AV2 three-state card (athlete_value "attendance" on)
 *   /dev/attendance/?view=off   the card main shows today (the feature off)
 */
export const metadata: Metadata = { title: 'Attendance · Tribe dev', robots: { index: false, follow: false } };

export default async function DevAttendancePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (!devFeedAllowed()) notFound();
  const { view } = await searchParams;
  return <DevAttendanceView threeState={view !== 'off'} />;
}
