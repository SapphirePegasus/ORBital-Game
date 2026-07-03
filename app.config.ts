import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Orbital',
  slug: 'orbital-game',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './src/assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#04060F',
  splash: {
    image: './src/assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#04060F',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.orbital.game',
    infoPlist: {
      UIRequiresFullScreen: true,
    },
    // Required for audio to play in silent mode
    requireFullScreen: true,
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './src/assets/adaptive-icon.png',
      backgroundColor: '#04060F',
    },
    package: 'com.orbital.game',
    // Keep screen on during gameplay
    permissions: ['android.permission.WAKE_LOCK'],
  },
  plugins: [
    'expo-router',
    [
      'expo-av',
      {
        microphonePermission: false,
      },
    ],
    // Reanimated — must be last babel plugin
    'react-native-reanimated',
    // Skia — auto-links native module
    '@shopify/react-native-skia',
    // Gesture handler
    'react-native-gesture-handler',
  ],
  experiments: {
    typedRoutes: true,
  },
});
