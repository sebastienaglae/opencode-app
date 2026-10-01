import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.opencode.remote',
  appName: 'OpenCode Remote',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
  server: {
    // http avoids mixed-content issues when talking to the bridge over plain
    // HTTP/WS on the LAN/VPN. The WebView origin becomes http://localhost.
    androidScheme: 'http',
    cleartext: true,
  },
  plugins: {
    CapacitorHttp: { enabled: false },
  },
};

export default config;
