/**
 * T-JOIN1 Part D. NEXT_PUBLIC_FEED_LITE, off unless set to "true".
 *
 * On, the home feed (app/page.tsx) drops its nine interstitials: StoriesRow,
 * StoriesCarousel, FeaturedPartnerBanner, PopularVenuesSection,
 * PopularRoutesSection, ExploreCitySection, StreakBanner, ReferralBanner and
 * InstructorUpsellBanner. ProfileCompletionBanner stays: it has a job. Off,
 * the feed is exactly what it was (app/page.feedLite.test.tsx snapshots it).
 *
 * Read at call time so a test can set it; in the browser bundle Next inlines
 * the value at build, so changing it needs a rebuild (a redeploy on Vercel).
 */
export function isFeedLite(): boolean {
  return process.env.NEXT_PUBLIC_FEED_LITE === 'true';
}
