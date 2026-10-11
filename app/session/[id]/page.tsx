/**
 * Page: /session/[id]. A server shell around SessionDetailClient, which is the
 * whole page.
 *
 * T-OG1: the page used to be the client component itself, and a client
 * component cannot export generateMetadata, so its HTML carried only the root
 * layout's generic tags and a /session/ link pasted into WhatsApp, Instagram or
 * iMessage showed no card. The tags come from the same function as /s/[id]'s,
 * so one session previews the same way from either URL.
 */
import type { Metadata } from 'next';
import { fetchPublicSession, sessionMetadata } from '@/app/s/[id]/sessionMetadata';
import SessionDetailClient from './SessionDetailClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return sessionMetadata(await fetchPublicSession(id), `/session/${id}/`);
}

export default function SessionDetailPage() {
  return <SessionDetailClient />;
}
