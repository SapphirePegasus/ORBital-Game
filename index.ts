import { registerRootComponent } from 'expo';
import { initErrorTracking } from './src/observability/sentry';
import App from './App';

// Native crash handlers must hook in before the first component mounts.
// A build without EXPO_PUBLIC_SENTRY_DSN makes this a complete no-op.
initErrorTracking();

registerRootComponent(App);
