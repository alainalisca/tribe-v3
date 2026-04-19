# Medellín-First Localization Design

**Date:** 2026-04-13
**Branch:** feature/social-features
**Source spec:** Claude_Code_Medellin_Localization_Spec.md

## Goal

Transform Tribe from a generic fitness app into one that feels native to Medellín — neighborhoods, local context, weather, and city identity woven into the experience. All city-specific values live in a single config so the app can expand to other cities by changing one line.

## Architecture Decision

Single config file `lib/city-config.ts` exports `ACTIVE_CITY: CityConfig` pointing to `MEDELLIN_CONFIG`. All components import from this file — no hardcoded city names in UI components.

## Adjustments From Source Spec

Based on codebase exploration:

1. **No existing greeting section.** The spec assumed a "3 sessions near you" greeting. The home feed goes FilterBar → StoriesRow → feed. We ADD a compact `CityGreeting` component between FilterBar and StoriesRow — user name + city + session count in 2 lines, minimal footprint.

2. **Hex colors → Tailwind tokens.** The spec references `bg-[#272D34]` etc. We use `tribe-dark`, `tribe-surface`, `tribe-mid`, `tribe-green` tokens instead (already converted across the codebase).

3. **Landing page is `app/LandingPage.tsx`.** Current tagline: "Find workout partners who match your schedule and goals." CTA: "Get Started" / "Comenzar".

4. **FilterBar already has `userLocation` prop.** Neighborhood detection can use this directly — no new geolocation wiring needed.

5. **Sessions have `location_lat`/`location_lng` columns.** Neighborhood filtering and badges are viable.

6. **`useHomeFeed.ts` manages `userLocation: { latitude, longitude } | null`.** This is the source of truth for user position.

7. **ExploreCitySection optimization.** The spec's per-neighborhood queries are acceptable for 6-8 neighborhoods. Include a TODO for RPC consolidation.

## Tasks (9)

### Task 1: Create `lib/city-config.ts`

Foundation file. CityConfig + Neighborhood interfaces, MEDELLIN_CONFIG with 8 neighborhoods (El Poblado, Laureles, Envigado, Centro, Belén, Sabaneta, Estadio, La América), utility functions (detectNeighborhood, getNearestNeighborhood, getPopularNeighborhoods). ACTIVE_CITY export.

### Task 2: Update Landing Page

- `app/LandingPage.tsx`: Replace tagline with `ACTIVE_CITY.tagline`, subtitle with `ACTIVE_CITY.subtitle`, CTA with `ACTIVE_CITY.joinCTA`
- Add neighborhood pills below subtitle for social proof

### Task 3: Add City Greeting to Home Feed

- Create `components/home/CityGreeting.tsx`: Compact 2-line component — city location tag + session count
- Wire into `app/page.tsx` between FilterBar and StoriesRow

### Task 4: Create WeatherBar Component

- Create `components/home/WeatherBar.tsx`: Open-Meteo API (free, no key), condition-to-fitness messages, graceful fallback to 24°C
- Wire into home feed below greeting, above filter

### Task 5: Add Neighborhood Filter Pills to FilterBar

- Add `selectedNeighborhood` state + pills after existing filters
- Auto-detect from `userLocation` on mount
- Pass selection up to parent for session query filtering via bounding box

### Task 6: Update Section Headers

- Replace static "near you" text with neighborhood-aware dynamic text using ACTIVE_CITY

### Task 7: Add Neighborhood Badge to Session Cards

- `components/SessionCard.tsx`: Detect neighborhood from session lat/lng, show badge overlay

### Task 8: Create Explore City Section + Neighborhood Banner

- `components/home/ExploreCitySection.tsx`: Neighborhood cards with session/instructor/athlete stats
- `components/home/NeighborhoodBanner.tsx`: Auto-detected neighborhood banner above greeting
- Wire both into home feed

### Task 9: Update Meta Tags and SEO

- `app/layout.tsx`: Title and description with city name
- `public/manifest.json`: Name with city tagline

## Rules

- All UI strings bilingual EN/ES
- Use Tailwind tokens, not hex colors
- Import city data from `lib/city-config.ts`, never hardcode "Medellín" in components
- DAL pattern for any new DB queries
- No Co-Authored-By in commits
