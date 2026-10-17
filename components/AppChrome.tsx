'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useIsMarketingSurface } from '@/lib/site/marketingSurface';

/*
 * T-SITE1 Part F. The app's own chrome, loaded once the page is idle instead of
 * in every first paint: service-worker registration (pulls in supabase-js and
 * the data layer), the install banner, the in-app notification toast and the
 * feedback widget (Radix dialogs). The last three never load on the marketing
 * site, which the spec forbids them on. None of them renders anything on the
 * server, so loading them later changes no HTML.
 */
const ServiceWorkerRegistration = dynamic(() => import('./ServiceWorkerRegistration'), { ssr: false });
const AppStoreBanner = dynamic(() => import('./IOSInstallPrompt'), { ssr: false });
const InAppNotificationToast = dynamic(() => import('./InAppNotificationToast'), { ssr: false });
const FeedbackWidget = dynamic(() => import('./FeedbackWidget'), { ssr: false });

export default function AppChrome({ appVersion, bottomOffset }: { appVersion: string; bottomOffset: number }) {
  const onMarketing = useIsMarketingSurface();
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => setIdle(true), { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => setIdle(true), 1500);
    return () => window.clearTimeout(id);
  }, []);

  if (!idle) return null;
  return (
    <>
      <ServiceWorkerRegistration />
      {!onMarketing && (
        <>
          <AppStoreBanner />
          <InAppNotificationToast />
          <FeedbackWidget appVersion={appVersion} bottomOffset={bottomOffset} />
        </>
      )}
    </>
  );
}
