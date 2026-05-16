import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.homeassistant.rti',
  appName: 'Home Assistant',
  webDir: 'dist',
  server: {
    url: 'https://6759.ddns.net/panel?token=08a1b44f352b969353f373a3175a70daf100b2bb220f0450e3f71ce078630809',
    cleartext: false,
  },
  ios: {
    contentInset: 'always',
  },
}

export default config
