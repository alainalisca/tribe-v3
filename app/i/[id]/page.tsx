import type { Metadata } from 'next';
import { coachCardVersion, coachGym, isListedCoach, loadCoach } from '@/lib/og/coachCard';
import { translateSport } from '@/lib/sportTranslationData';
import InstructorShareClient from './InstructorShareClient';
import { SITE_URL } from '@/lib/http/siteUrl';
import { shareImageOrigin } from '@/lib/http/shareImageOrigin';

const BASE_URL = SITE_URL;

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  // Service role (lib/og/coachCard): the same row the card route draws, read
  // once, so the card's ?v= fingerprint and the card itself always agree.
  const instructor = await loadCoach(id);

  if (!instructor || !isListedCoach(instructor)) {
    return {
      title: 'Instructor no disponible | Tribe',
      description: 'Este perfil de instructor no está disponible en Tribe.',
    };
  }

  // Spanish sport names: a scraper sends no session and no language we act on,
  // and the market is Colombia. translateSport is the house helper CLAUDE.md
  // names; joining the raw enum values would print "Martial Arts" on a Spanish
  // card and "Weight_Training" with an underscore.
  const sportsLabel = instructor.sports?.length
    ? instructor.sports.map((sp: string) => translateSport(sp, 'es')).join(' · ')
    : 'Entrenamiento';

  // instructor_bio first, bio second: instructor_bio is the field both
  // instructor-facing editors write, so it matches the storefront. The bio
  // fallback keeps a description for instructors who only filled the older
  // general bio field.
  const ogName = instructor.name || 'Instructor';
  const storefrontBio = instructor.instructor_bio || instructor.bio;
  const description = storefrontBio
    ? storefrontBio.substring(0, 160)
    : [ogName, sportsLabel, 'Entrena con quien te hace mejor.'].filter(Boolean).join(' · ');

  // T-SHARE1 Part C: one page, two addresses. The handle when there is one.
  const slug = instructor.handle || instructor.id;
  const gym = await coachGym(instructor.id);
  // Trailing slash matches next.config trailingSlash:true, so scrapers fetch
  // the image directly instead of chasing a 308 redirect.
  // The card on a Vercel preview's own host there, tribelatam.com in production (shareImageOrigin).
  const ogImageUrl = `${shareImageOrigin()}/i/${slug}/card/?v=${coachCardVersion(instructor, gym)}`;
  const image = {
    url: ogImageUrl,
    width: 1200,
    height: 630,
    type: 'image/jpeg',
    alt: `Entrena con ${ogName} en Tribe`,
  };

  return {
    title: `${ogName} | Tribe`,
    description,
    openGraph: {
      title: `${ogName} en Tribe`,
      description,
      type: 'website',
      siteName: 'Tribe - Never Train Alone',
      url: `${BASE_URL}/i/${slug}/`,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${ogName} en Tribe`,
      description,
      images: [ogImageUrl],
    },
  };
}

export default function PublicInstructorPage() {
  return <InstructorShareClient />;
}
