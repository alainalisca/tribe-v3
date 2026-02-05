import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'prod.tribe.android',
  appName: 'Tribe',
  webDir: 'out',
  android: {
    buildOptions: {
      keystorePath: 'app.keystore',
      keystoreAlias: 'upload',
    }
  },
  plugins: {
    FirebaseMessaging: {
      // Present notifications when app is in foreground
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;
