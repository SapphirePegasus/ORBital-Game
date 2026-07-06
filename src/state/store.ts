/**
 * Minimal observable store (≈40 lines) built on React 19's
 * useSyncExternalStore — concurrent-mode safe, no external state library
 * (see docs/decisions/ADR-002). API mirrors the familiar get/set/subscribe
 * shape so swapping to Zustand later would be a mechanical change.
 */
import { useSyncExternalStore } from 'react';

export interface Store<T> {
  get: () => T;
  /** Shallow-merges a partial state or the result of an updater fn. */
  set: (patch: Partial<T> | ((prev: T) => Partial<T>)) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => state,
    set: (patch) => {
      const next = typeof patch === 'function' ? patch(state) : patch;
      let changed = false;
      for (const key in next) {
        if (!Object.is(state[key as keyof T], next[key as keyof T])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...next };
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Select a slice; component re-renders only when the selected value changes. */
export function useStore<T extends object, S>(store: Store<T>, selector: (s: T) => S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    () => selector(store.get()),
  );
}
