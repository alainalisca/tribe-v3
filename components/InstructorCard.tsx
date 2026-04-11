'use client';

import Link from 'next/link';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Star, CheckCircle, Users, Award, MapPin } from 'lucide-react';
import { formatDistance } from '@/lib/distance';
import type { InstructorProfile } from '@/lib/dal/instructors';

interface InstructorCardProps {
  instructor: InstructorProfile & { distanceKm?: number | null };
  language: 'en' | 'es';
}

const t = (language: 'en' | 'es') => ({
  specialties: language === 'es' ? 'Especialidades' : 'Specialties',
  sessionsHosted: language === 'es' ? 'Sesiones Alojadas' : 'Sessions Hosted',
  yearsExperience: language === 'es' ? 'Anos de Experiencia' : 'Years Experience',
  noRating: language === 'es' ? 'Sin Calificacion' : 'No Rating',
  reviews: language === 'es' ? 'resenas' : 'reviews',
  viewStorefront: language === 'es' ? 'Ver Perfil' : 'View Storefront',
  away: language === 'es' ? 'de distancia' : 'away',
});

function renderInitials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

function RatingStars({ rating, reviews, language }: { rating: number; reviews: number; language: 'en' | 'es' }) {
  const labels = t(language);
  if (reviews === 0) {
    return <span className="text-sm text-stone-500">{labels.noRating}</span>;
  }
  const fullStars = Math.floor(rating);
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`w-4 h-4 ${
              i < fullStars || (i === fullStars && rating % 1 >= 0.5)
                ? 'fill-tribe-green text-tribe-green'
                : 'text-stone-300'
            }`}
          />
        ))}
      </div>
      <span className="text-sm font-semibold text-stone-700 dark:text-stone-300">{rating.toFixed(1)}</span>
      <span className="text-xs text-stone-500 dark:text-stone-400">
        ({reviews} {labels.reviews})
      </span>
    </div>
  );
}

export default function InstructorCard({ instructor, language }: InstructorCardProps) {
  const labels = t(language);

  return (
    <Card className="bg-theme-card border-theme hover:border-tribe-green transition overflow-hidden flex flex-col">
      <CardContent className="p-4 flex flex-col h-full">
        {/* Avatar + Name */}
        <div className="flex flex-col items-center mb-4">
          <Avatar className="w-20 h-20 border-3 border-tribe-green mb-3">
            <AvatarImage loading="lazy" src={instructor.avatar_url || undefined} alt={instructor.name || ''} />
            <AvatarFallback className="bg-tribe-green text-lg font-bold text-slate-900">
              {renderInitials(instructor.name)}
            </AvatarFallback>
          </Avatar>
          <div className="text-center w-full">
            <div className="flex items-center justify-center gap-2 mb-1">
              <h3 className="font-bold text-theme-primary text-sm leading-tight">{instructor.name}</h3>
              {instructor.verified && <CheckCircle className="w-4 h-4 text-tribe-green" />}
            </div>
          </div>
        </div>

        {/* Rating */}
        <div className="mb-3 flex justify-center w-full">
          <RatingStars rating={instructor.average_rating} reviews={instructor.total_reviews} language={language} />
        </div>

        {/* Specialties */}
        {instructor.specialties.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1.5">{labels.specialties}</p>
            <div className="flex flex-wrap gap-1">
              {instructor.specialties.slice(0, 3).map((s, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 bg-tribe-green/20 text-tribe-green text-xs font-medium rounded-full"
                >
                  {s}
                </span>
              ))}
              {instructor.specialties.length > 3 && (
                <span className="px-2 py-0.5 bg-stone-100 dark:bg-[#3D4349] text-stone-600 dark:text-stone-400 text-xs font-medium rounded-full">
                  +{instructor.specialties.length - 3}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="space-y-2 mb-4 text-xs text-theme-secondary flex-grow">
          {instructor.distanceKm != null && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-500" />
              <span className="font-medium text-blue-600 dark:text-blue-400">
                {formatDistance(instructor.distanceKm, language)} {labels.away}
              </span>
            </div>
          )}
          {instructor.location && !instructor.distanceKm && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-stone-400" />
              <span className="truncate">{instructor.location}</span>
            </div>
          )}
          {instructor.total_sessions > 0 && (
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-tribe-green" />
              <span>
                {instructor.total_sessions} {labels.sessionsHosted}
              </span>
            </div>
          )}
          {instructor.years_experience > 0 && (
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-tribe-green" />
              <span>
                {instructor.years_experience} {labels.yearsExperience}
              </span>
            </div>
          )}
        </div>

        {/* CTA */}
        <Link href={`/storefront/${instructor.id}`} className="w-full">
          <Button className="w-full bg-tribe-green text-slate-900 hover:bg-[#8FD642] font-semibold rounded-lg">
            {labels.viewStorefront}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
