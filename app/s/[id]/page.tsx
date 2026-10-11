import type { Metadata } from 'next';
import SessionShareClient from './SessionShareClient';
import { fetchPublicSession, sessionMetadata } from './sessionMetadata';
import { SITE_URL } from '@/lib/http/siteUrl';
import { serializeJsonLd, sessionEventJsonLd, sessionJsonLdInputFromRow } from '@/lib/seo/jsonLd';

const BASE_URL = SITE_URL;

interface PageProps {
  params: Promise<{ id: string }>;
}

// The fetch and the og/twitter tags live in ./sessionMetadata, shared with
// /session/[id] so both URLs for one session unfurl the same card (T-OG1).
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return sessionMetadata(await fetchPublicSession(id), `/s/${id}/`);
}

export default async function PublicSessionPage({ params }: PageProps) {
  const { id } = await params;
  const initialSession = await fetchPublicSession(id);
  // T-GROW5a: schema.org Event for search. Built from the same sessions_public
  // row the page renders, so it cannot say more than the page does.
  const jsonLd = initialSession
    ? sessionEventJsonLd(
        sessionJsonLdInputFromRow(initialSession as unknown as Record<string, unknown>, `${BASE_URL}/s/${id}/`)
      )
    : null;
  return (
    <>
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />}
      <SessionShareClient initialSession={initialSession} sessionId={id} />
    </>
  );
}
