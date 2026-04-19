import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import InstructorShareClient from './InstructorShareClient';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.tribesocial.co';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: instructor } = await supabase
    .from('users')
    .select('id, name, avatar_url, bio, sports, average_rating')
    .eq('id', id)
    .single();

  if (!instructor) {
    return {
      title: 'Instructor Not Found | Tribe',
      description: 'This instructor profile is not available on Tribe.',
    };
  }

  const sportsLabel = instructor.sports?.length ? instructor.sports.join(', ') : 'Fitness';

  const ratingStr = instructor.average_rating ? ` (${instructor.average_rating.toFixed(1)}★)` : '';

  const description = instructor.bio
    ? instructor.bio.substring(0, 160)
    : `${instructor.name || 'Instructor'} — ${sportsLabel} instructor on Tribe${ratingStr}`;

  const subtitle = `${sportsLabel} instructor${ratingStr}`;

  // OG image URL
  const ogParams = new URLSearchParams({
    type: 'instructor',
    title: instructor.name || 'Instructor',
    subtitle,
    avatar: instructor.avatar_url || '',
  });

  const ogImageUrl = `${BASE_URL}/api/og?${ogParams.toString()}`;

  return {
    title: `${instructor.name || 'Instructor'} | Tribe`,
    description,
    openGraph: {
      title: `${instructor.name || 'Instructor'} on Tribe`,
      description,
      type: 'website',
      siteName: 'Tribe - Never Train Alone',
      url: `${BASE_URL}/i/${id}`,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: instructor.name || 'Instructor' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${instructor.name || 'Instructor'} on Tribe`,
      description,
      images: [ogImageUrl],
    },
  };
}

export default function PublicInstructorPage() {
  return <InstructorShareClient />;
}
