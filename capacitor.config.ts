import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'prod.tribe.android',
  appName: 'Tribe',
  webDir: 'out',
  // server.url removed for production — app loads from bundled web assets.
  // To test against a live server during development, uncomment:
  // server: {
  //   url: 'https://tribe-v3.vercel.app',
  //   cleartext: true
  // },
  android: {
    buildOptions: {
      keystorePath: 'app.keystore',
      keystoreAlias: 'upload',
    }
  },
  ios: {
    scrollEnabled: false,
  },
  plugins: {
    FirebaseMessaging: {
      // Present notifications when app is in foreground
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;
