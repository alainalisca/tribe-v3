import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { translateSport } from '@/lib/sportTranslationData';
import InstructorShareClient from './InstructorShareClient';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tribe-v3.vercel.app';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: instructor } = await supabase
    .from('users')
    .select('id, name, avatar_url, bio, instructor_bio, sports, average_rating')
    .eq('id', id)
    .single();

  if (!instructor) {
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

  const ratingStr = instructor.average_rating ? `${instructor.average_rating.toFixed(1)} ★` : '';

  // instructor_bio first, bio second: instructor_bio is the field both
  // instructor-facing editors write, so it matches the storefront. The bio
  // fallback keeps a description for instructors who only filled the older
  // general bio field.
  const storefrontBio = instructor.instructor_bio || instructor.bio;
  const description = storefrontBio
    ? storefrontBio.substring(0, 160)
    : [instructor.name || 'Instructor', sportsLabel, 'Entrena con quien te hace mejor.'].filter(Boolean).join(' · ');

  const ogName = instructor.name || 'Instructor';
  const subtitle = sportsLabel;

  // OG image URL
  const ogParams = new URLSearchParams({
    type: 'instructor',
    title: ogName,
    subtitle,
    sub2: ratingStr,
    avatar: instructor.avatar_url || '',
  });

  // Trailing slash matches next.config trailingSlash:true, so scrapers fetch
  // the image directly instead of chasing a 308 redirect.
  const ogImageUrl = `${BASE_URL}/api/og/?${ogParams.toString()}`;

  return {
    title: `${ogName} | Tribe`,
    description,
    openGraph: {
      title: `${ogName} en Tribe`,
      description,
      type: 'website',
      siteName: 'Tribe - Never Train Alone',
      url: `${BASE_URL}/i/${id}/`,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: ogName }],
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
