/**
 * T-JOIN1 Part A. The bridge components: the Jornada site's look in the app.
 * FixtureRow is the site's own row (components/site/FixtureRow.tsx), adapted
 * with an `app` tone rather than built twice.
 */
export { default as PosterHeader } from './PosterHeader';
export { default as DayHeader } from './DayHeader';
export { default as FactsLedger, type Fact } from './FactsLedger';
export { default as FixtureRow, type Fixture, type FixtureLabels } from '@/components/site/FixtureRow';
