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
import DeepLinkRouter from '@/components/DeepLinkRouter';
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
 * The document language is STATIC, and the inline script below corrects it.
 *
 * It was `lang="en"` with the script correcting after hydration, which served
 * the wrong value to crawlers, link unfurlers and screen readers that read the
 * attribute as the document loads. 740475b fixed that by reading
 * Accept-Language in this layout, and its reasoning was explicit:
 *
 *   "Reading headers() opts the route into dynamic rendering. That costs
 *    nothing here: createClient() awaits cookies(), so every route in this app
 *    is already f (Dynamic) in the build output"
 *
 * THE PREMISE WAS WRONG, AND IT WAS MEASURABLE AT THE TIME. The build before
 * that commit emitted 79 static routes, including `/`. Reading headers() in
 * the ROOT layout opts in every route underneath it, so the count fell to 2:
 * robots.txt and sitemap.xml, the only two that render no React. The home page
 * stopped being prerendered, `.next/server/app/index.html` stopped existing,
 * and the bundle budget that measures it started failing with "run the build
 * first" on every pull request.
 *
 * WHY STATIC "es" RATHER THAN THE OLD "en". The accessibility fix 740475b was
 * reaching for is real, and it does not need a request. Spanish is what this
 * app defaults to (detectPreferredLanguage: Spanish unless the browser asks
 * for English first) and the audience is Colombian, so the static value is
 * right for the common case and wrong strictly less often than `en` was. The
 * script below still corrects a stored choice, exactly as before.
 *
 * WHAT THIS GIVES UP, deliberately: an English-first browser now receives
 * lang="es" in the unhydrated frame instead of lang="en". That is one wrong
 * attribute for the minority case, against every route in the app losing
 * prerendering. If server-side negotiation is wanted back, it belongs in
 * middleware, which already runs per request and can set the attribute
 * without dragging the static build down with it.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={jakartaSans.variable} suppressHydrationWarning>
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
            the default until the provider hydrates. This CORRECTS the document
            language when the stored choice differs from the static value the
            document was served with. */}
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
                <DeepLinkRouter />
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
