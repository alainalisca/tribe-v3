import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aplusfitnessllc.tribe',
  appName: 'Tribe',
  webDir: 'public',
  server: {
    url: 'https://tribe-v3.vercel.app',
    cleartext: true
  }
};

export default config;
