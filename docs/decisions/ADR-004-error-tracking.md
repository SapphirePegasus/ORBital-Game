# ADR-004: Error tracking via Sentry behind a first-party seam

**Date:** 2026-07-07
**Status:** Accepted

## Context
A production mobile game needs crash visibility (JS + native), but: (a) no
third-party SDK should be load-bearing — the game must run identically
without it; (b) no PII may ever leave the device; (c) the user must be able
to opt out; (d) builds must succeed with zero Sentry account configured.

## Decision
- `@sentry/react-native` **8.17.2** (pinned exact). First-party Sentry SDK,
  MIT, official Expo config plugin, peer-compatible with Expo SDK 56 /
  RN 0.85 (verified against the installed package, not docs-from-memory).
- All call sites go through `src/observability/errorReporter.ts`
  (`reportError` / `breadcrumb`). Sentry plugs in via `setReporter()` in
  `src/observability/sentry.ts`; nothing else imports Sentry (the one
  dynamic import in progressStore is for the opt-out toggle).
- Activation requires `EXPO_PUBLIC_SENTRY_DSN` (env-injected, never
  hardcoded) **and** the user's `crashReports` feature toggle. No DSN →
  the module is a complete no-op.
- Privacy: `sendDefaultPii: false`, `tracesSampleRate: 0` (crash reporting
  only), no `setUser` anywhere, `beforeSend` strips `event.user`,
  breadcrumbs restricted by contract to enum-like game facts.
- Source-map upload is **disabled by default** (`disableAutoUpload` in the
  plugin + `SENTRY_DISABLE_AUTO_UPLOAD=true` in EAS profiles) so builds
  never fail on a missing `SENTRY_AUTH_TOKEN`. Enabling is a documented
  three-env-var flip (README).

## Alternatives Considered
1. `sentry-expo` — rejected: deprecated; `@sentry/react-native` is the
   supported path for Expo since SDK 50.
2. Bugsnag / Crashlytics — rejected: Crashlytics drags in Firebase +
   Google services config; Bugsnag has no first-class Expo plugin. Sentry
   is the Expo-documented default.
3. No error tracking — rejected: production quality requires crash
   visibility; the seam already existed for exactly this.

## Consequences
- Positive: zero behavioral difference when dormant; single-line adapter
  swap if the vendor ever changes; user-controllable; store-review safe
  (crash-only data, disclosed in Data Safety as "app diagnostics").
- Negative: enabling the `crashReports` toggle applies on next launch
  (Sentry.init is not safely re-entrant) — disabling is immediate.
