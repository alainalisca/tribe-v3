import { Plus_Jakarta_Sans } from 'next/font/google';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { Toaster } from 'react-hot-toast';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import AppStoreBanner from '@/components/IOSInstallPrompt';
import BackButtonHandler from '@/components/BackButtonHandler';
import InAppNotificationToast from '@/components/InAppNotificationToast';
import { LanguageProvider } from '@/lib/LanguageContext';
import { PostHogProvider } from '@/components/PostHogProvider';
import FeedbackWidget from '@/components/FeedbackWidget';
import PageTransition from '@/components/PageTransition';
import { ConfirmProvider } from '@/components/ConfirmProvider';
import './globals.css';
import type { Metadata } from 'next';

const jakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});

// Title and description mirror ACTIVE_CITY in lib/city-config.ts (Medellín)
export const metadata: Metadata = {
  title: 'Tribe — Never Train Alone in Medellín',
  description:
    "Find fitness sessions, instructors, and training partners in Medellín. Join the fitness community that's taking over the city.",
  manifest: '/manifest.json',
  // Smart App Banner: Safari on iOS shows a native "open in App Store" bar on
  // every page. In-app webviews (Instagram/Facebook) ignore it — the /download
  // page carries its own escape hatch for those.
  itunes: { appId: '6458219258' },
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Tribe - Never Train Alone',
    description: 'Find fitness sessions, connect with athletes, and train with the best instructors in Medellín.',
    type: 'website',
    siteName: 'Tribe - Never Train Alone',
    images: [{ url: '/api/og', width: 1200, height: 630, alt: 'Tribe - Never Train Alone' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tribe - Never Train Alone',
    description: 'Find fitness sessions, connect with athletes, and train with the best instructors in Medellín.',
    images: ['/api/og'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakartaSans.variable} suppressHydrationWarning>
      <head>
        {/* Theme FOUC guard — runs before paint/hydration. Reads the
            saved preference (default light), resolves "system", and sets
            the html class so there's no flash of the wrong theme. Must
            stay in sync with applyThemeClass() in contexts/ThemeContext. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('tribe-theme')||'light';if(t==='system'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}var c=document.documentElement.classList;c.remove('light','dark');c.add(t==='dark'?'dark':'light');}catch(e){}})();`,
          }}
        />
        {/* Language pre-paint guard. Sets <html lang> from the saved choice
            before hydration so assistive tech and search engines see the
            language the user actually gets, instead of the hardcoded "en"
            below. Must stay in sync with LANGUAGE_STORAGE_KEY and
            readStoredLanguage() in lib/LanguageContext.

            Note this cannot do for text what the theme guard does for colour.
            The theme is a CSS class, so a script can fix it before paint; the
            copy is React state, so the first server rendered frame is still
            English until the provider hydrates. This sets the document
            language, which is a real correctness fix on its own. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var l=localStorage.getItem('language');if(l==='en'||l==='es'){document.documentElement.lang=l;}}catch(e){}})();`,
          }}
        />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Tribe" />
      </head>
      <body>
        <PostHogProvider>
          <ThemeProvider>
            <LanguageProvider>
              <Toaster
                position="top-center"
                containerStyle={{
                  top: 'calc(max(env(safe-area-inset-top, 0px), 20px) + 12px)',
                }}
                toastOptions={{
                  style: {
                    marginTop: '8px',
                  },
                }}
              />
              <ServiceWorkerRegistration />
              <AppStoreBanner />
              <BackButtonHandler />
              <InAppNotificationToast />
              <ConfirmProvider>
                <PageTransition>{children}</PageTransition>
              </ConfirmProvider>
              <FeedbackWidget appVersion="2.5.0" bottomOffset={80} />
            </LanguageProvider>
          </ThemeProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
