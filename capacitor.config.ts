import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'prod.tribe.android',
  appName: 'Tribe',
  webDir: 'out',
  // Required: the app uses 15+ API routes (notifications, cron, geocode, etc.)
  // hosted on Vercel. Without server.url, relative fetch('/api/...') calls fail
  // because bundled assets have no backend. Post-launch we can migrate to
  // bundled assets + absolute API URLs.
  server: {
    url: 'https://tribe-v3.vercel.app',
    // Allow OAuth domains to navigate within the WKWebView instead of
    // opening in Safari. Required for Apple/Google Sign-In to redirect
    // back to the app after authentication.
    allowNavigation: ['*.supabase.co', '*.google.com', '*.apple.com', '*.googleapis.com'],
  },
  android: {
    buildOptions: {
      keystorePath: 'app.keystore',
      keystoreAlias: 'upload',
    }
  },
  ios: {
    scrollEnabled: true,
  },
  plugins: {
    FirebaseMessaging: {
      // Present notifications when app is in foreground
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;
