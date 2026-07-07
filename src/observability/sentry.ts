/**
 * Sentry integration — plugs into the errorReporter seam (setReporter), so
 * no call site anywhere in the app knows Sentry exists.
 *
 * Activation requires BOTH:
 *   1. A DSN in the EXPO_PUBLIC_SENTRY_DSN env var (inlined at build time —
 *      never hardcoded; see README "Error tracking" for the EAS setup).
 *      No DSN → this module is a complete no-op and the console reporter
 *      stays active.
 *   2. The user's `crashReports` feature toggle. Disabling it closes the
 *      client immediately; re-enabling takes effect on the next launch
 *      (Sentry.init must run once, early, and is not safely re-entrant).
 *
 * Privacy posture (see ADR-004):
 *   - sendDefaultPii: false — no IPs, no user identity, ever.
 *   - No Sentry.setUser call exists in this codebase.
 *   - Breadcrumbs carry only enum-like game facts (death causes, purchase
 *     ids) per the errorReporter contract.
 *   - tracesSampleRate: 0 — crash reporting only, no performance telemetry.
 */
import * as Sentry from '@sentry/react-native';
import { setReporter } from './errorReporter';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

let initialized = false;
let userEnabled = true;

/**
 * Call once from index.ts, before the root component registers, so native
 * crash handlers hook in as early as possible. Safe no-op without a DSN.
 */
export const initErrorTracking = (): void => {
  if (initialized || !DSN) return;
  initialized = true;
  try {
    Sentry.init({
      dsn: DSN,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      maxBreadcrumbs: 50,
      enableAutoSessionTracking: true,
      // Redact anything that could ever carry device-identifying extras.
      beforeSend(event) {
        if (!userEnabled) return null; // user opted out this session
        delete event.user;
        return event;
      },
    });
    setReporter({
      captureException(error, context) {
        if (!userEnabled) return;
        Sentry.captureException(error, { extra: context });
      },
      breadcrumb(message, data) {
        if (!userEnabled) return;
        Sentry.addBreadcrumb({ message, data, level: 'info' });
      },
    });
  } catch {
    // Error tracking must never crash the app it is meant to observe.
    initialized = false;
  }
};

/**
 * Apply the persisted `crashReports` preference (called after progress
 * loads, and again on toggle). Disabling closes the transport immediately.
 */
export const applyCrashReportPreference = (enabled: boolean): void => {
  userEnabled = enabled;
  if (initialized && !enabled) {
    void Sentry.close().catch(() => undefined);
    initialized = false;
  }
};
