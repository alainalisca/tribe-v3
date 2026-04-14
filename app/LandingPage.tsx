'use client';

import MarketingLayout from '@/components/marketing/MarketingLayout';
import HeroSection from '@/components/marketing/landing/HeroSection';
import HowItWorksSection from '@/components/marketing/landing/HowItWorksSection';
import ForAthletesSection from '@/components/marketing/landing/ForAthletesSection';
import ForInstructorsPreview from '@/components/marketing/landing/ForInstructorsPreview';
import FAQPreviewSection from '@/components/marketing/landing/FAQPreviewSection';
import FinalCTASection from '@/components/marketing/landing/FinalCTASection';

// NOTE: SocialProofBar and TestimonialsSection intentionally omitted until
// we have real stats and real user testimonials. Re-add once replaced.
export default function LandingPage(): JSX.Element {
  return (
    <MarketingLayout fullBleed>
      <HeroSection />
      <HowItWorksSection />
      <ForAthletesSection />
      <ForInstructorsPreview />
      <FAQPreviewSection />
      <FinalCTASection />
    </MarketingLayout>
  );
}
