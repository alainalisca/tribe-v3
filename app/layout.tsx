import { headers } from 'next/headers';
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
import ReducedMotionProvider from '@/components/ReducedMotionProvider';
import { ConfirmProvider } from '@/components/ConfirmProvider';
import './globals.css';
import type { Metadata, Viewport } from 'next';

const jakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});

// Title and description mirror ACTIVE_CITY in lib/city-config.ts (Medellín)
/**
 * T-AUD6. This MUST be the Next viewport export, never a hand-written
 * <meta name="viewport"> in <head>.
 *
 * WHY: a raw tag does not suppress Next's default. The App Router emits its own
 * `width=device-width, initial-scale=1` whenever this export is absent, so the
 * hand-written tag produced TWO viewport metas in production -- measured on the
 * deployed page, ours at byte offset 148 and Next's at 237 -- and the second one
 * carries no viewport-fit.
 *
 * WHY THAT MATTERS MORE THAN IT SOUNDS: without viewport-fit=cover every
 * env(safe-area-inset-*) resolves to 0. This app has 66 fixed/sticky headers
 * that handle the safe area correctly, and all of them fall back to their 44px
 * floor -- which is LESS than an iPhone notch inset. So headers rendering under
 * the status bar is not missing padding, it is padding computing against a zero
 * inset. The rules are right; the environment they read was wrong.
 *
 * lib/__tests__/viewportMeta.test.ts asserts exactly one viewport source exists.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

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

/**
 * The document language, decided on the SERVER from Accept-Language.
 *
 * It was hardcoded `lang="en"` with the inline script below correcting it after
 * hydration. That left the wrong value in the first painted frame and in
 * everything that never hydrates: crawlers, link unfurlers, and every
 * screen reader that reads the attribute as the document loads. On a product
 * whose users are Colombian by default, the served document claimed English.
 *
 * Reading headers() opts the route into dynamic rendering. That costs nothing
 * here: `createClient()` awaits `cookies()`, so every route in this app is
 * already `ƒ (Dynamic)` in the build output -- the same finding that made
 * `export const revalidate` inert on /instructors.
 *
 * Matches detectPreferredLanguage() in lib/LanguageContext: SPANISH UNLESS THE
 * BROWSER EXPLICITLY ASKS FOR ENGLISH FIRST. The client script still runs and
 * still wins, because a stored choice beats a header guess.
 */
function languageFromHeaders(accept: string | null): 'en' | 'es' {
  if (!accept) return 'es';
  for (const part of accept.split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase();
    if (tag.startsWith('es')) return 'es';
    if (tag.startsWith('en')) return 'en';
  }
  return 'es';
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = languageFromHeaders((await headers()).get('accept-language'));
  return (
    <html lang={lang} className={jakartaSans.variable} suppressHydrationWarning>
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
            English until the provider hydrates. This CORRECTS the document
            language when the stored choice differs from the Accept-Language
            guess the server rendered; the server now gets the common case
            right on the first frame, which is what crawlers and unhydrated
            reads see. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var l=localStorage.getItem('language');if(l==='en'||l==='es'){document.documentElement.lang=l;}}catch(e){}})();`,
          }}
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Tribe" />
      </head>
      <body>
        <PostHogProvider>
          <ReducedMotionProvider>
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
          </ReducedMotionProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
