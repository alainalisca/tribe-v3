'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import { logError } from '@/lib/logger';
import BottomNav from '@/components/BottomNav';
import InstructorCard from '@/components/InstructorCard';
import FeaturedInstructorCarousel from '@/components/FeaturedInstructorCarousel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, MapPin, List, Navigation, Loader2 } from 'lucide-react';
import { requestUserLocation } from '@/lib/location';
import { calculateDistance, formatDistance } from '@/lib/distance';
import { type InstructorProfile } from '@/lib/dal/instructors';
import { sportTranslations } from '@/lib/translations';
import { SPORTS_LIST } from '@/lib/sports';
import DiscoverTabs from '@/components/instructors/DiscoverTabs';
import GymsTabPanel from '@/components/instructors/GymsTabPanel';
import type { GymDirectoryEntry } from '@/lib/dal/gymDirectory';
import { discoverTabQuery, type DiscoverTab } from '@/lib/discover/discoverTab';
import { trackEvent } from '@/lib/analytics';
import { getTranslations } from './copy';
import { useTranslations } from '@/lib/i18n/useTranslations';

/**
 * Client-side interactivity for /instructors.
 *
 * The parent Server Component fetches the initial instructor list
 * server-side (faster initial paint, no client bundle cost for the
 * fetch logic) and passes it via props. This component handles:
 *
 *   - Search + sport filter + sort state
 *   - Near-me geolocation lookup
 *   - Map view (dynamic Google Maps init)
 *   - Retrying a failed server fetch via router.refresh(), which re-runs
 *     the Server Component (the route is dynamic, so there is no cache to
 *     defeat)
 *
 * The Server Component's fetch is the source of truth. There is no
 * client-side duplicate of fetchInstructors and no fetch on mount: the
 * retry path refreshes the route instead, so there is only ever one place
 * that knows how to load instructors.
 */

type SortOption = 'most_sessions' | 'highest_rated' | 'newest' | 'nearest';
type ViewMode = 'list' | 'map';

/**
 * The sport filter chips. Drawn from the canonical SPORTS_LIST so this row can
 * never drift from what an instructor is offered when they pick their sports.
 * `Other` is a real stored value but meaningless as a filter, so it is hidden
 * here the same way TrainingPreferencesForm hides it.
 */
const FILTER_SPORTS = SPORTS_LIST.filter((sport) => sport !== 'Other');

interface InstructorsPageClientProps {
  initialInstructors: InstructorProfile[];
  /**
   * The server fetch failed, so `initialInstructors` being empty says nothing
   * about the directory. Without this the page cannot tell three different
   * situations apart, and used to show all three the same screen.
   */
  instructorsFailed: boolean;
  gyms: GymDirectoryEntry[];
  gymsFailed: boolean;
  /** From the `ver` query param, parsed on the server so the first paint is the right tab. */
  initialTab: DiscoverTab;
}

export default function InstructorsPageClient({
  initialInstructors,
  instructorsFailed,
  gyms,
  gymsFailed,
  initialTab,
}: InstructorsPageClientProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const t = getTranslations(language);
  const td = useTranslations('discover');

  // Seeded from server payload — no loading spinner on first render, and
  // no client-side fetch on mount.
  const [instructors] = useState<InstructorProfile[]>(initialInstructors);
  const [filtered, setFiltered] = useState<(InstructorProfile & { distanceKm?: number | null })[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('most_sessions');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [tab, setTab] = useState<DiscoverTab>(initialTab);

  // replace, not push: flipping the switch is not a navigation, so it should
  // not add a back-button stop. The URL still records it, so a shared link or
  // a reload lands on the same tab.
  function changeTab(next: DiscoverTab) {
    setTab(next);
    router.replace(`/instructors/${discoverTabQuery(next)}`, { scroll: false });
    trackEvent('discover_tab_changed', { tab: next });
  }

  /**
   * The route is dynamic (see the header comment in page.tsx), so refreshing it
   * re-runs the Server Component and its fetches. That is the whole retry: no
   * client-side duplicate of fetchInstructors, no second code path to keep in
   * step with the DAL.
   */
  function retry() {
    setRetrying(true);
    router.refresh();
  }

  useEffect(() => {
    filterAndSort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, sortBy, instructors, userLat, userLng, selectedSport]);

  function filterAndSort() {
    let list = instructors.map((inst) => ({
      ...inst,
      distanceKm:
        userLat != null && userLng != null && inst.location_lat && inst.location_lng
          ? calculateDistance(userLat, userLng, inst.location_lat, inst.location_lng)
          : null,
    }));
    if (selectedSport) list = list.filter((i) => i.sports.includes(selectedSport));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (i) =>
          i.name?.toLowerCase().includes(q) ||
          i.sports.some((s) => s.toLowerCase().includes(q)) ||
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
    // "Near me" button click — explicit user intent, so prompt if
    // permission isn't already granted. The home feed's background
    // location read uses the silent getUserLocation variant.
    const loc = await requestUserLocation();
    setGettingLocation(false);
    if (loc) {
      setUserLat(loc.latitude);
      setUserLng(loc.longitude);
      setSortBy('nearest');
    }
  }

  // Map initialization — lazy-load Google Maps only when the user switches
  // to the map view, and re-run when filtered list or location changes.
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
            title: language === 'es' ? 'Tu ubicación' : 'Your location',
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
  }, [viewMode, filtered, userLat, userLng, mapLoaded, language]);

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
    <div className="min-h-screen bg-theme-page pb-nav">
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl md:max-w-4xl mx-auto h-14 flex items-center px-4">
          <h1 className="text-xl font-bold text-theme-primary">{tab === 'gyms' ? td('titleGyms') : t.title}</h1>
        </div>
      </div>

      <div className="pt-header max-w-2xl md:max-w-4xl mx-auto p-4 md:p-6 space-y-4">
        <DiscoverTabs tab={tab} onChange={changeTab} instructorCount={instructors.length} gymCount={gyms.length} />

        {tab === 'gyms' ? (
          <GymsTabPanel gyms={gyms} failed={gymsFailed} retrying={retrying} onRetry={retry} />
        ) : (
          <>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-stone-400" />
              <Input
                type="text"
                placeholder={t.search}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 py-2 rounded-lg bg-white dark:bg-tribe-surface border-stone-200 dark:border-tribe-mid"
              />
            </div>

            {/* Sport Filter Pills */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide md:justify-center md:overflow-visible md:flex-wrap md:mx-0 md:px-0">
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
              {FILTER_SPORTS.map((sport) => (
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

              {/* Sort Pills */}
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
            <FeaturedInstructorCarousel language={language} />

            {/* Map */}
            {viewMode === 'map' && (
              <div className="rounded-xl overflow-hidden border border-theme">
                <div id="instructor-map" className="w-full h-[400px] bg-stone-200 dark:bg-tribe-surface" />
              </div>
            )}

            {/* Results. Data is hydrated from the server, so there is no loading
            skeleton -- but "nothing to show" has THREE causes and they need
            three different screens. Offering Clear Search when the fetch failed
            tells the user the failure is theirs, and clearing their filters
            cannot fix it. Ordered most-specific first: a failure is a failure
            whatever the filters say. */}
            {instructorsFailed ? (
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6">
                <div className="text-5xl mb-4">⚠️</div>
                <h2 className="text-xl font-semibold text-theme-primary mb-2">{t.loadFailed}</h2>
                <p className="text-sm text-theme-secondary mb-6">{t.loadFailedDesc}</p>
                <Button
                  onClick={retry}
                  disabled={retrying}
                  className="px-6 py-2 bg-tribe-green text-slate-900 font-semibold hover:bg-tribe-green"
                >
                  {retrying ? t.retrying : t.retry}
                </Button>
              </div>
            ) : instructors.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-6">
                <div className="text-5xl mb-4">🌱</div>
                <h2 className="text-xl font-semibold text-theme-primary mb-2">{t.noneYet}</h2>
                <p className="text-sm text-theme-secondary">{t.noneYetDesc}</p>
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
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
