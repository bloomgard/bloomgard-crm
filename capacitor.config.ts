import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bloomgard.app',
  appName: 'Bloomgard',
  webDir: 'out',
  server: {
    allowNavigation: [
      'bloomgard.vercel.app',
      '*.vercel.app',
      '*.supabase.co',
      'openrouter.ai',
      '*.openrouter.ai',
      'cdn.jsdelivr.net',
      'cdnjs.cloudflare.com',
      'fonts.googleapis.com',
      'fonts.gstatic.com'
    ]
  },
  android: {
    allowMixedContent: true
  },
  plugins: {
    StatusBar: {
      style: 'light',
      backgroundColor: '#000000',
      overlaysWebView: false
    }
  }
};

export default config;