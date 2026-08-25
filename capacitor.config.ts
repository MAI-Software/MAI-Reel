import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.maisoftwares.maireel',
  appName: 'MAI-Reel',
  webDir: 'dist',
  android: {
    // the editor draws every frame on a canvas: let the WebView use the GPU
    webContentsDebuggingEnabled: true,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
