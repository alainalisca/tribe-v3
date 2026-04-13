'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';
import BottomNav from '@/components/BottomNav';
import InstructorCard from '@/components/InstructorCard';
import FeaturedInstructorCarousel from '@/components/FeaturedInstructorCarousel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SkeletonCard } from '@/components/Skeleton';
import { Search, MapPin, List, Navigation, Loader2 } from 'lucide-react';
import { getUserLocation } from '@/lib/location';
import { calculateDistance, formatDistance } from '@/lib/distance';
import { fetchInstructors, type InstructorProfile } from '@/lib/dal/instructors';
import { sportTranslations } from '@/lib/translations';

type SortOption = 'most_sessions' | 'highest_rated' | 'newest' | 'nearest';
type ViewMode = 'list' | 'map';

const SPORTS_LIST = [
  'Running',
  'Cycling',
  'CrossFit',
  'Yoga',
  'Boxing',
  'Swimming',
  'Weightlifting',
  'Tennis',
  'Hiking',
  'Soccer',
  'Basketball',
  'Dance',
];

const getTranslations = (language: 'en' | 'es') => ({
  title: language === 'es' ? 'Descubre Instructores' : 'Discover Instructors',
  search: language === 'es' ? 'Buscar por nombre o especialidades...' : 'Search by name or specialties...',
  sortMostSessions: language === 'es' ? 'Mas Sesiones' : 'Most Sessions',
  sortHighestRated: language === 'es' ? 'Mejor Calificados' : 'Highest Rated',
  sortNewest: language === 'es' ? 'Mas Nuevo' : 'Newest',
  sortNearest: language === 'es' ? 'Mas Cerca' : 'Nearest',
  sort: language === 'es' ? 'Ordenar' : 'Sort',
  noInstructorsFound: language === 'es' ? 'No se encontraron instructores' : 'No instructors found',
  noInstructorsDesc:
    language === 'es'
      ? 'Intenta ajustar tu busqueda o vuelve mas tarde'
      : 'Try adjusting your search or check back later',
  mapView: language === 'es' ? 'Mapa' : 'Map',
  listView: language === 'es' ? 'Lista' : 'List',
  nearMe: language === 'es' ? 'Cerca de mi' : 'Near Me',
  gettingLocation: language === 'es' ? 'Obteniendo ubicacion...' : 'Getting location...',
  clearSearch: language === 'es' ? 'Limpiar Busqueda' : 'Clear Search',
  all: language === 'es' ? 'Todos' : 'All',
});

export default function InstructorsPage() {
  const supabase = createClient();
  const { language } = useLanguage();
  const t = getTranslations(language);

  const [instructors, setInstructors] = useState<InstructorProfile[]>([]);
  const [filtered, setFiltered] = useState<(InstructorProfile & { distanceKm?: number | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('most_sessions');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const result = await fetchInstructors(supabase);
        if (result.success && result.data) setInstructors(result.data);
      } catch (error) {
        logError(error, { action: 'loadInstructors' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    filterAndSort();
  }, [searchQuery, sortBy, instructors, userLat, userLng, selectedSport]);

  function filterAndSort() {
    let list = instructors.map((inst) => ({
      ...inst,
      distanceKm:
        userLat != null && userLng != null && inst.location_lat && inst.location_lng
          ? calculateDistance(userLat, userLng, inst.location_lat, inst.location_lng)
          : null,
    }));
    if (selectedSport) list = list.filter((i) => i.specialties.includes(selectedSport));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (i) =>
          i.name?.toLowerCase().includes(q) ||
          i.specialties.some((s) => s.toLowerCase().includes(q)) ||
          i.location?.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      switch (sortBy) {
        case 'highest_rated':
          return b.average_rating - a.average_rating || b.total_reviews - a.total_reviews;
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'nearest':
          if (a.distanceKm == null && b.distanceKm == null) return 0;
          if (a.distanceKm == null) return 1;
          if (b.distanceKm == null) return -1;
          return a.distanceKm - b.distanceKm;
        default:
          return b.total_sessions - a.total_sessions;
      }
    });
    setFiltered(list);
  }

  async function handleNearMe() {
    if (userLat != null) {
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

  // Map initialization
  useEffect(() => {
    if (viewMode !== 'map' || mapLoaded) return;
    (async () => {
      try {
        const { loadGoogleMaps } = await import('@/lib/google-maps');
        await loadGoogleMaps();
        const container = document.getElementById('instructor-map');
        if (!container) return;
        const center = userLat && userLng ? { lat: userLat, lng: userLng } : { lat: 6.2442, lng: -75.5812 };
        const map = new google.maps.Map(container, {
          center,
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
        });
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
            title: language === 'es' ? 'Tu ubicacion' : 'Your location',
          });
        }
        const bounds = new google.maps.LatLngBounds();
        let hasMarkers = false;
        filtered.forEach((inst) => {
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
          const distText = inst.distanceKm != null ? ` - ${formatDistance(inst.distanceKm, language)}` : '';
          const info = new google.maps.InfoWindow({
            content: `
            <div style="padding:8px;max-width:200px;">
              <strong>${inst.name || ''}</strong>${inst.verified ? ' &#10003;' : ''}
              ${inst.average_rating ? `<div style="color:#65a30d;font-size:12px;">&#9733; ${inst.average_rating.toFixed(1)} (${inst.total_reviews})</div>` : ''}
              ${inst.location ? `<div style="font-size:11px;color:#666;">${inst.location}${distText}</div>` : ''}
              <a href="/storefront/${inst.id}" style="display:inline-block;margin-top:6px;font-size:12px;color:#A3E635;font-weight:600;">
                ${language === 'es' ? 'Ver Perfil &rarr;' : 'View Profile &rarr;'}</a>
            </div>`,
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
    })();
  }, [viewMode, filtered, userLat, userLng]);

  const sortOpts: SortOption[] = [
    'most_sessions',
    'highest_rated',
    'newest',
    ...(userLat ? ['nearest' as SortOption] : []),
  ];
  const sortLabel: Record<SortOption, string> = {
    most_sessions: t.sortMostSessions,
    highest_rated: t.sortHighestRated,
    newest: t.sortNewest,
    nearest: t.sortNearest,
  };

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <h1 className="text-xl font-bold text-theme-primary">{t.title}</h1>
        </div>
      </div>

      <div className="pt-header max-w-2xl mx-auto p-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-stone-400" />
          <Input
            type="text"
            placeholder={t.search}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 py-2 rounded-lg bg-white dark:bg-tribe-surface border-stone-200 dark:border-[#52575D]"
          />
        </div>

        {/* Sport Filter Pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
          <button
            onClick={() => setSelectedSport(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition shrink-0 ${
              !selectedSport
                ? 'bg-tribe-green text-slate-900 font-semibold'
                : 'bg-stone-100 dark:bg-tribe-surface text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-tribe-mid'
            }`}
          >
            {t.all}
          </button>
          {SPORTS_LIST.map((sport) => (
            <button
              key={sport}
              onClick={() => setSelectedSport(selectedSport === sport ? null : sport)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition shrink-0 ${
                selectedSport === sport
                  ? 'bg-tribe-green text-slate-900 font-semibold'
                  : 'bg-stone-100 dark:bg-tribe-surface text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-tribe-mid'
              }`}
            >
              {sportTranslations[sport]?.[language] || sport}
            </button>
          ))}
        </div>

        {/* View Toggle + Near Me + Sort */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-stone-100 dark:bg-tribe-surface rounded-lg p-0.5 shrink-0">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition ${viewMode === 'list' ? 'bg-white dark:bg-tribe-mid text-theme-primary shadow-sm' : 'text-stone-500'}`}
            >
              <List className="w-3.5 h-3.5" />
              {t.listView}
            </button>
            <button
              onClick={() => {
                setViewMode('map');
                setMapLoaded(false);
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition ${viewMode === 'map' ? 'bg-white dark:bg-tribe-mid text-theme-primary shadow-sm' : 'text-stone-500'}`}
            >
              <MapPin className="w-3.5 h-3.5" />
              {t.mapView}
            </button>
          </div>
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

          {/* Sort Pills — inline with view controls */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <span className="text-xs font-semibold text-stone-600 dark:text-stone-400 whitespace-nowrap">
              {t.sort}:
            </span>
            {sortOpts.map((opt) => (
              <button
                key={opt}
                onClick={() => setSortBy(opt)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition shrink-0 ${
                  sortBy === opt
                    ? 'bg-tribe-green text-slate-900 font-semibold'
                    : 'bg-stone-100 dark:bg-tribe-surface text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-tribe-mid'
                }`}
              >
                {sortLabel[opt]}
              </button>
            ))}
          </div>
        </div>

        {/* Featured Carousel */}
        {!loading && <FeaturedInstructorCarousel language={language} />}

        {/* Map */}
        {viewMode === 'map' && (
          <div className="rounded-xl overflow-hidden border border-theme">
            <div id="instructor-map" className="w-full h-[400px] bg-stone-200 dark:bg-tribe-surface" />
          </div>
        )}

        {/* Results */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6">
            <div className="text-5xl mb-4">🔍</div>
            <h2 className="text-xl font-semibold text-theme-primary mb-2">{t.noInstructorsFound}</h2>
            <p className="text-sm text-theme-secondary mb-6">{t.noInstructorsDesc}</p>
            <Button
              onClick={() => {
                setSearchQuery('');
                setSelectedSport(null);
              }}
              className="px-6 py-2 bg-tribe-green text-slate-900 font-semibold hover:bg-tribe-green"
            >
              {t.clearSearch}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((inst) => (
              <InstructorCard key={inst.id} instructor={inst} language={language} />
            ))}
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
