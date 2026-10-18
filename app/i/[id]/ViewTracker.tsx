'use client';

import { useEffect } from 'react';
import { trackEvent } from '@/lib/analytics';

/** The coach page's view event, kept from the old client page (T-SHARE1 Part E made the page server-rendered). */
export default function ViewTracker({ coachId }: { coachId: string }) {
  useEffect(() => {
    trackEvent('instructor_profile_viewed', { instructor_id: coachId, source: 'public_share' });
  }, [coachId]);
  return null;
}
