/**
 * Error-reporting seam. This pass ships it dormant (console in dev, no-op in
 * production); the next pass plugs Sentry into `setReporter` at boot without
 * touching any call site. Keeping the seam first-party means no native SDK
 * enters the app before the dev-client workflow exists to test it.
 *
 * Security note: breadcrumbs must never contain user content — only enum-like
 * game facts (death causes, phase changes, purchase ids). There is no PII in
 * this app, and this seam must keep it that way.
 */

export interface ErrorReporter {
  captureException(error: unknown, context?: Record<string, string | number>): void;
  breadcrumb(message: string, data?: Record<string, string | number>): void;
}

const devReporter: ErrorReporter = {
  captureException(error, context) {
    if (__DEV__) console.error('[error-reporter]', error, context ?? '');
  },
  breadcrumb(message, data) {
    if (__DEV__) console.log('[breadcrumb]', message, data ?? '');
  },
};

let active: ErrorReporter = devReporter;

/** Called once at boot by the observability integration (e.g. Sentry). */
export const setReporter = (reporter: ErrorReporter): void => {
  active = reporter;
};

export const reportError = (error: unknown, context?: Record<string, string | number>): void => {
  try {
    active.captureException(error, context);
  } catch {
    /* the reporter itself must never crash the app */
  }
};

export const breadcrumb = (message: string, data?: Record<string, string | number>): void => {
  try {
    active.breadcrumb(message, data);
  } catch {
    /* noop */
  }
};
