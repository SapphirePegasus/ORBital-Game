/**
 * Metro config wrapped by Sentry's Expo helper: injects Debug IDs into
 * release bundles and annotates source maps so stack traces symbolicate.
 * Behaves exactly like Expo's default config when Sentry stays dormant.
 * Verified against @sentry/react-native 8.17.2 (metro.d.ts).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
