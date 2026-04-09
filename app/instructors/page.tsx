'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';
import BottomNav from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { SkeletonCard } from '@/components/Skeleton';
import { Star, Award, Users, Search, CheckCircle, Zap, TrendingUp, MapPin, List, Navigation, Loader2 } from 'lucide-react';
import { getUserLocation } from '@/lib/location';
import { calculateDistance, formatDistance } from '@/lib/distance';
import type { Database } from '@/lib/database.types';

interface Instructor {
  id: string;
  name: string | null;
  avatar_url: string | null;
  instructor_bio: string | null;
  certifications: string | null;
  created_at: string;
  is_instructor: boolean;
  specialties?: string[];
  average_rating?: number;
  total_sessions_hosted?: number;
  years_experience?: number;
  is_verified_instructor?: boolean;
  total_reviews?: number;
  location?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  distanceKm?: number | null; // Computed client-side from user location
}

type SortOption = 'most_sessions' | 'highest_rated' | 'newest' | 'nearest';
type ViewMode = 'list' | 'map';

const getTranslations = (language: 'en' | 'es') => ({
  title: language === 'es' ? 'Descubre Instructores' : 'Discover Instructors',
  search: language === 'es' ? 'Buscar por nombre o especialidades...' : 'Search by name or specialties...',
  sortMostSessions: language === 'es' ? 'Más Sesiones' : 'Most Sessions',
  sortHighestRated: language === 'es' ? 'Mejor Calificados' : 'Highest Rated',
  sortNewest: language === 'es' ? 'Más Nuevo' : 'Newest',
  sort: language === 'es' ? 'Ordenar' : 'Sort',
  specialties: language === 'es' ? 'Especialidades' : 'Specialties',
  sessionsHosted: language === 'es' ? 'Sesiones Alojadas' : 'Sessions Hosted',
  yearsExperience: language === 'es' ? 'Años de Experiencia' : 'Years Experience',
  verified: language === 'es' ? 'Verificado' : 'Verified',
  rating: language === 'es' ? 'Calificación' : 'Rating',
  viewProfile: language === 'es' ? 'Ver Perfil' : 'View Profile',
  noInstructorsFound: language === 'es' ? 'No se encontraron instructores' : 'No instructors found',
  noInstructorsDesc: language === 'es'
    ? 'Intenta ajustar tu búsqueda o vuelve más tarde'
    : 'Try adjusting your search or check back later',
  loading: language === 'es' ? 'Cargando...' : 'Loading...',
  noRating: language === 'es' ? 'Sin Calificación' : 'No Rating',
  reviews: language === 'es' ? 'reseñas' : 'reviews',
  featured: language === 'es' ? 'Destacados' : 'Featured',
  featuredDesc: language === 'es' ? 'Instructores promovidos activamente' : 'Actively promoted instructors',
  allInstructors: language === 'es' ? 'Todos los Instructores' : 'All Instructors',
  boosted: language === 'es' ? 'Destacado' : 'Featured',
  proInstructor: language === 'es' ? 'Instructor Pro' : 'Pro Instructor',
  sortNearest: language === 'es' ? 'Más Cerca' : 'Nearest',
  mapView: language === 'es' ? 'Mapa' : 'Map',
  listView: language === 'es' ? 'Lista' : 'List',
  nearMe: language === 'es' ? 'Cerca de mí' : 'Near Me',
  gettingLocation: language === 'es' ? 'Obteniendo ubicación...' : 'Getting location...',
  locationError: language === 'es' ? 'No se pudo obtener ubicación' : 'Could not get location',
  away: language === 'es' ? 'de distancia' : 'away',
});

export default function InstructorsPage() {
  const supabase = createClient();
  const { language } = useLanguage();
  const t = getTranslations(language);

  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [featuredInstructors, setFeaturedInstructors] = useState<Instructor[]>([]);
  const [filteredInstructors, setFilteredInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('most_sessions');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useState<HTMLDivElement | null>(null);
  const mapInstanceRef = useState<google.maps.Map | null>(null);

  useEffect(() => {
    fetchInstructors();
    fetchFeaturedInstructors();
  }, []);

  useEffect(() => {
    filterAndSortInstructors();
  }, [searchQuery, sortBy, instructors, userLat, userLng]);

  async function fetchInstructors() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select(
          'id, name, avatar_url, instructor_bio, specialties, certifications, years_experience, is_verified_instructor, total_sessions_hosted, total_participants_served, average_rating, total_reviews, created_at, location, location_lat, location_lng'
        )
        .eq('is_instructor', true)
        .not('average_rating', 'is', null);

      if (error) {
        logError(error, { action: 'fetchInstructors' });
        return;
      }

      const processedInstructors: Instructor[] = (data || []).map((instructor) => ({
        ...instructor,
        is_instructor: true,
        specialties: (instructor.specialties as string[]) || [],
        average_rating: instructor.average_rating || 0,
        total_sessions_hosted: instructor.total_sessions_hosted || 0,
        years_experience: instructor.years_experience || 0,
        is_verified_instructor: instructor.is_verified_instructor || false,
        total_reviews: instructor.total_reviews || 0,
        location: instructor.location || null,
        location_lat: instructor.location_lat || null,
        location_lng: instructor.location_lng || null,
        distanceKm: null,
      }));

      setInstructors(processedInstructors);
    } catch (error) {
      logError(error, { action: 'fetchInstructors' });
    } finally {
      setLoading(false);
    }
  }

  async function fetchFeaturedInstructors() {
    try {
      const now = new Date().toISOString();

      // Get instructor IDs with active boost campaigns
      const { data: boostData, error: boostError } = await supabase
        .from('boost_campaigns')
        .select('instructor_id')
        .eq('status', 'active')
        .lte('starts_at', now)
        .gte('ends_at', now);

      // Also get Pro-tier instructors (storefront_tier = 'pro')
      const { data: proData, error: proError } = await supabase
        .from('users')
        .select(
          'id, name, avatar_url, instructor_bio, specialties, certifications, years_experience, is_verified_instructor, total_sessions_hosted, total_participants_served, average_rating, total_reviews, created_at, storefront_tier, storefront_tagline'
        )
        .eq('is_instructor', true)
        .eq('storefront_tier', 'pro');

      // Collect unique featured instructor IDs
      const boostedIds = new Set<string>();
      if (!boostError && boostData) {
        boostData.forEach((row: any) => boostedIds.add(row.instructor_id));
      }

      // Add Pro instructors
      const proInstructors: Instructor[] = (proData || []).map((inst: any) => ({
        ...inst,
        is_instructor: true,
        specialties: (inst.specialties as string[]) || [],
        average_rating: inst.average_rating || 0,
        total_sessions_hosted: inst.total_sessions_hosted || 0,
        years_experience: inst.years_experience || 0,
        is_verified_instructor: inst.is_verified_instructor || false,
        total_reviews: inst.total_reviews || 0,
      }));

      // If there are boosted instructors not already in pro list, fetch them
      const proIds = new Set(proInstructors.map((i) => i.id));
      const missingBoostedIds = [...boostedIds].filter((id) => !proIds.has(id));

      let boostedInstructors: Instructor[] = [];
      if (missingBoostedIds.length > 0) {
        const { data: boostedData } = await supabase
          .from('users')
          .select(
            'id, name, avatar_url, instructor_bio, specialties, certifications, years_experience, is_verified_instructor, total_sessions_hosted, total_participants_served, average_rating, total_reviews, created_at, storefront_tier, storefront_tagline'
          )
          .in('id', missingBoostedIds)
          .eq('is_instructor', true);

        boostedInstructors = (boostedData || []).map((inst: any) => ({
          ...inst,
          is_instructor: true,
          specialties: (inst.specialties as string[]) || [],
          average_rating: inst.average_rating || 0,
          total_sessions_hosted: inst.total_sessions_hosted || 0,
          years_experience: inst.years_experience || 0,
          is_verified_instructor: inst.is_verified_instructor || false,
          total_reviews: inst.total_reviews || 0,
        }));
      }

      // Merge and deduplicate: boosted instructors first, then pro
      const allFeatured = [...boostedInstructors, ...proInstructors];
      const uniqueFeatured = allFeatured.filter(
        (inst, index, self) => self.findIndex((i) => i.id === inst.id) === index
      );

      // Sort by rating then sessions
      uniqueFeatured.sort(
        (a, b) =>
          (b.average_rating || 0) - (a.average_rating || 0) ||
          (b.total_sessions_hosted || 0) - (a.total_sessions_hosted || 0)
      );

      setFeaturedInstructors(uniqueFeatured);
    } catch (error) {
      logError(error, { action: 'fetchFeaturedInstructors' });
    }
  }

  function filterAndSortInstructors() {
    // Compute distances if we have user location
    let filtered = instructors.map((inst) => {
      if (userLat != null && userLng != null && inst.location_lat && inst.location_lng) {
        return {
          ...inst,
          distanceKm: calculateDistance(userLat, userLng, inst.location_lat, inst.location_lng),
        };
      }
      return { ...inst, distanceKm: null };
    });

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((instructor) => {
        const nameMatch = instructor.name?.toLowerCase().includes(query);
        const specialtiesMatch = (instructor.specialties || []).some((s: string) =>
          s.toLowerCase().includes(query)
        );
        const locationMatch = instructor.location?.toLowerCase().includes(query);
        return nameMatch || specialtiesMatch || locationMatch;
      });
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'highest_rated':
          const ratingDiff = (b.average_rating || 0) - (a.average_rating || 0);
          if (ratingDiff !== 0) return ratingDiff;
          return (b.total_reviews || 0) - (a.total_reviews || 0);

        case 'newest':
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();

        case 'nearest':
          // Instructors with location come first, sorted by distance
          if (a.distanceKm == null && b.distanceKm == null) return 0;
          if (a.distanceKm == null) return 1;
          if (b.distanceKm == null) return -1;
          return a.distanceKm - b.distanceKm;

        case 'most_sessions':
        default:
          return (b.total_sessions_hosted || 0) - (a.total_sessions_hosted || 0);
      }
    });

    setFilteredInstructors(sorted);
  }

  /** Request user location and switch to "nearest" sort */
  async function handleNearMe() {
    if (userLat != null) {
      // Already have location, just switch sort
      setSortBy('nearest');
      return;
    }
    setGettingLocation(true);
    const loc = await getUserLocation();
    setGettingLocation(false);
    if (loc) {
      setUserLat(loc.latitude);
      setUserLng(loc.longitude);
      setSortBy('nearest');
    }
  }

  /** Initialize Google Map when switching to map view */
  useEffect(() => {
    if (viewMode !== 'map' || mapLoaded) return;

    const initMap = async () => {
      try {
        const { loadGoogleMaps } = await import('@/lib/google-maps');
        await loadGoogleMaps();

        const container = document.getElementById('instructor-map');
        if (!container) return;

        // Default center: Bogotá, Colombia
        const center = userLat && userLng
          ? { lat: userLat, lng: userLng }
          : { lat: 4.711, lng: -74.0721 };

        const map = new google.maps.Map(container, {
          center,
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: [
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          ],
        });

        // Add user location marker
        if (userLat && userLng) {
          new google.maps.Marker({
            position: { lat: userLat, lng: userLng },
            map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#4285F4',
              fillOpacity: 1,
              strokeColor: '#fff',
              strokeWeight: 2,
            },
            title: language === 'es' ? 'Tu ubicación' : 'Your location',
          });
        }

        // Add instructor markers
        const bounds = new google.maps.LatLngBounds();
        let hasMarkers = false;

        filteredInstructors.forEach((inst) => {
          if (!inst.location_lat || !inst.location_lng) return;

          const pos = { lat: inst.location_lat, lng: inst.location_lng };
          hasMarkers = true;
          bounds.extend(pos);

          const marker = new google.maps.Marker({
            position: pos,
            map,
            title: inst.name || '',
            icon: {
              path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
              fillColor: '#A3E635',
              fillOpacity: 1,
              strokeColor: '#65a30d',
              strokeWeight: 1.5,
              scale: 1.8,
              anchor: new google.maps.Point(12, 22),
            },
          });

          const distText = inst.distanceKm != null
            ? ` • ${formatDistance(inst.distanceKm, language)}`
            : '';

          const info = new google.maps.InfoWindow({
            content: `
              <div style="padding:8px;max-width:200px;">
                <strong style="font-size:14px;">${inst.name || ''}</strong>
                ${inst.is_verified_instructor ? ' ✓' : ''}
                ${inst.average_rating ? `<div style="color:#65a30d;font-size:12px;">★ ${inst.average_rating.toFixed(1)} (${inst.total_reviews || 0})</div>` : ''}
                ${inst.location ? `<div style="font-size:11px;color:#666;">${inst.location}${distText}</div>` : ''}
                ${(inst.specialties || []).length > 0 ? `<div style="font-size:11px;color:#A3E635;margin-top:4px;">${(inst.specialties || []).slice(0, 2).join(', ')}</div>` : ''}
                <a href="/storefront/${inst.id}" style="display:inline-block;margin-top:6px;font-size:12px;color:#A3E635;font-weight:600;">
                  ${language === 'es' ? 'Ver Perfil →' : 'View Profile →'}
                </a>
              </div>
            `,
          });

          marker.addListener('click', () => info.open(map, marker));
        });

        if (hasMarkers) {
          if (userLat && userLng) bounds.extend({ lat: userLat, lng: userLng });
          map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
        }

        setMapLoaded(true);
      } catch (err) {
        logError(err, { action: 'initInstructorMap' });
      }
    };

    initMap();
  }, [viewMode, filteredInstructors, userLat, userLng]);

  function renderStars(rating: number, reviews: number) {
    const fullStars = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;

    if (reviews === 0) {
      return (
        <span className="text-sm text-stone-500">
          {t.noRating}
        </span>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`w-4 h-4 ${
                i < fullStars
                  ? 'fill-tribe-green text-tribe-green'
                  : i === fullStars && hasHalf
                  ? 'fill-tribe-green text-tribe-green'
                  : 'text-stone-300'
              }`}
            />
          ))}
        </div>
        <span className="text-sm font-semibold text-stone-700 dark:text-stone-300">
          {rating.toFixed(1)}
        </span>
        <span className="text-xs text-stone-500 dark:text-stone-400">
          ({reviews} {t.reviews})
        </span>
      </div>
    );
  }

  function renderInitials(name: string | null) {
    if (!name) return '?';
    const parts = name.split(' ');
    return (
      parts
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase()
    );
  }

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <h1 className="text-xl font-bold text-theme-primary">{t.title}</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-header max-w-2xl mx-auto p-4 space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-stone-400" />
          <Input
            type="text"
            placeholder={t.search}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 py-2 rounded-lg bg-white dark:bg-[#3D4349] border-stone-200 dark:border-[#52575D]"
          />
        </div>

        {/* View Toggle + Sort Options */}
        <div className="flex items-center gap-2">
          {/* Map/List Toggle */}
          <div className="flex bg-stone-100 dark:bg-[#3D4349] rounded-lg p-0.5 shrink-0">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                viewMode === 'list'
                  ? 'bg-white dark:bg-[#52575D] text-theme-primary shadow-sm'
                  : 'text-stone-500'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              {t.listView}
            </button>
            <button
              onClick={() => { setViewMode('map'); setMapLoaded(false); }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                viewMode === 'map'
                  ? 'bg-white dark:bg-[#52575D] text-theme-primary shadow-sm'
                  : 'text-stone-500'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              {t.mapView}
            </button>
          </div>

          {/* Near Me button */}
          <button
            onClick={handleNearMe}
            disabled={gettingLocation}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition shrink-0 ${
              sortBy === 'nearest'
                ? 'bg-tribe-green text-slate-900'
                : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50'
            }`}
          >
            {gettingLocation ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Navigation className="w-3.5 h-3.5" />
            )}
            {gettingLocation ? t.gettingLocation : t.nearMe}
          </button>
        </div>

        {/* Sort Options */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          <span className="text-xs font-semibold text-stone-600 dark:text-stone-400 flex items-center whitespace-nowrap">
            {t.sort}:
          </span>
          {(['most_sessions', 'highest_rated', 'newest', ...(userLat ? ['nearest' as SortOption] : [])] as SortOption[]).map((option) => (
            <button
              key={option}
              onClick={() => setSortBy(option)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                sortBy === option
                  ? 'bg-tribe-green text-slate-900 font-semibold'
                  : 'bg-stone-100 dark:bg-[#3D4349] text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-[#52575D]'
              }`}
            >
              {option === 'most_sessions' && t.sortMostSessions}
              {option === 'highest_rated' && t.sortHighestRated}
              {option === 'newest' && t.sortNewest}
              {option === 'nearest' && t.sortNearest}
            </button>
          ))}
        </div>

        {/* Featured Instructors Section */}
        {featuredInstructors.length > 0 && !loading && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-tribe-green" />
              <h2 className="text-lg font-bold text-theme-primary">{t.featured}</h2>
            </div>
            <p className="text-xs text-theme-secondary -mt-1">{t.featuredDesc}</p>

            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory">
              {featuredInstructors.map((instructor) => (
                <Link
                  key={`featured-${instructor.id}`}
                  href={`/storefront/${instructor.id}`}
                  className="snap-start shrink-0 w-44"
                >
                  <div className="relative bg-gradient-to-br from-tribe-green/10 to-tribe-green/5 border border-tribe-green/30 rounded-xl p-3 hover:border-tribe-green transition h-full">
                    {/* Featured badge */}
                    <div className="absolute -top-2 -right-2 bg-tribe-green text-slate-900 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      {t.boosted}
                    </div>

                    <div className="flex flex-col items-center text-center">
                      <Avatar className="w-14 h-14 border-2 border-tribe-green mb-2">
                        <AvatarImage
                          loading="lazy"
                          src={instructor.avatar_url || undefined}
                          alt={instructor.name || ''}
                        />
                        <AvatarFallback className="bg-tribe-green text-sm font-bold text-slate-900">
                          {renderInitials(instructor.name)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex items-center gap-1 mb-1">
                        <h3 className="font-bold text-theme-primary text-xs leading-tight truncate max-w-[120px]">
                          {instructor.name}
                        </h3>
                        {instructor.is_verified_instructor && (
                          <CheckCircle className="w-3.5 h-3.5 text-tribe-green shrink-0" />
                        )}
                      </div>

                      {/* Rating mini */}
                      {(instructor.total_reviews || 0) > 0 && (
                        <div className="flex items-center gap-1 mb-1">
                          <Star className="w-3 h-3 fill-tribe-green text-tribe-green" />
                          <span className="text-[11px] font-semibold text-theme-primary">
                            {(instructor.average_rating || 0).toFixed(1)}
                          </span>
                          <span className="text-[10px] text-theme-secondary">
                            ({instructor.total_reviews})
                          </span>
                        </div>
                      )}

                      {/* Top specialty */}
                      {(instructor.specialties || []).length > 0 && (
                        <span className="px-2 py-0.5 bg-tribe-green/20 text-tribe-green text-[10px] font-medium rounded-full truncate max-w-[120px]">
                          {(instructor.specialties || [])[0]}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 pt-1">
              <div className="flex-1 h-px bg-stone-200 dark:bg-gray-700" />
              <span className="text-xs font-semibold text-theme-secondary">{t.allInstructors}</span>
              <div className="flex-1 h-px bg-stone-200 dark:bg-gray-700" />
            </div>
          </div>
        )}

        {/* Map View */}
        {viewMode === 'map' && (
          <div className="rounded-xl overflow-hidden border border-theme">
            <div
              id="instructor-map"
              className="w-full h-[400px] bg-stone-200 dark:bg-[#3D4349]"
            />
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filteredInstructors.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6">
            <div className="text-5xl mb-4">🔍</div>
            <h2 className="text-xl font-semibold text-theme-primary mb-2">
              {t.noInstructorsFound}
            </h2>
            <p className="text-sm text-theme-secondary mb-6">
              {t.noInstructorsDesc}
            </p>
            <Button
              onClick={() => setSearchQuery('')}
              className="px-6 py-2 bg-tribe-green text-slate-900 font-semibold hover:bg-[#8FD642]"
            >
              {language === 'es' ? 'Limpiar Búsqueda' : 'Clear Search'}
            </Button>
          </div>
        ) : (
          /* Grid of Instructor Cards */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredInstructors.map((instructor) => (
              <Card
                key={instructor.id}
                className="bg-theme-card border-theme hover:border-tribe-green transition overflow-hidden flex flex-col"
              >
                <CardContent className="p-4 flex flex-col h-full">
                  {/* Avatar and Header */}
                  <div className="flex flex-col items-center mb-4">
                    <Avatar className="w-20 h-20 border-3 border-tribe-green mb-3">
                      <AvatarImage
                        loading="lazy"
                        src={instructor.avatar_url || undefined}
                        alt={instructor.name || ''}
                      />
                      <AvatarFallback className="bg-tribe-green text-lg font-bold text-slate-900">
                        {renderInitials(instructor.name)}
                      </AvatarFallback>
                    </Avatar>

                    {/* Name and Verified Badge */}
                    <div className="text-center w-full">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <h3 className="font-bold text-theme-primary text-sm leading-tight">
                          {instructor.name}
                        </h3>
                        {instructor.is_verified_instructor && (
                          <CheckCircle className="w-4 h-4 text-tribe-green" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Rating */}
                  <div className="mb-3 flex justify-center w-full">
                    {renderStars(instructor.average_rating || 0, instructor.total_reviews || 0)}
                  </div>

                  {/* Specialties */}
                  {(instructor.specialties || []).length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-stone-600 dark:text-stone-400 mb-1.5">
                        {t.specialties}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {(instructor.specialties || []).slice(0, 3).map((specialty: string, idx: number) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 bg-tribe-green/20 text-tribe-green text-xs font-medium rounded-full"
                          >
                            {specialty}
                          </span>
                        ))}
                        {(instructor.specialties || []).length > 3 && (
                          <span className="px-2 py-0.5 bg-stone-100 dark:bg-[#3D4349] text-stone-600 dark:text-stone-400 text-xs font-medium rounded-full">
                            +{(instructor.specialties || []).length - 3}
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
                          {formatDistance(instructor.distanceKm, language)} {t.away}
                        </span>
                      </div>
                    )}
                    {instructor.location && !instructor.distanceKm && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-stone-400" />
                        <span className="truncate">{instructor.location}</span>
                      </div>
                    )}
                    {(instructor.total_sessions_hosted || 0) > 0 && (
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-tribe-green" />
                          <span>
                            {instructor.total_sessions_hosted || 0} {t.sessionsHosted}
                          </span>
                        </div>
                      )}
                    {(instructor.years_experience || 0) > 0 && (
                        <div className="flex items-center gap-2">
                          <Award className="w-4 h-4 text-tribe-green" />
                          <span>
                            {instructor.years_experience || 0} {t.yearsExperience}
                          </span>
                        </div>
                      )}
                  </div>

                  {/* View Profile Button */}
                  <Link href={`/profile/${instructor.id}`} className="w-full">
                    <Button className="w-full bg-tribe-green text-slate-900 hover:bg-[#8FD642] font-semibold rounded-lg">
                      {t.viewProfile}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
