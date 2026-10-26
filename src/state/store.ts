import { useSyncExternalStore } from 'react';

export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T, persistKey?: string): Store<T> {
  let state = initial;
  if (persistKey) {
    try {
      const raw = localStorage.getItem(persistKey);
      if (raw) state = { ...initial, ...JSON.parse(raw) };
    } catch {
      /* storage unavailable; use defaults */
    }
  }
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next) {
      state = typeof next === 'function' ? (next as (p: T) => T)(state) : next;
      if (persistKey) {
        try {
          localStorage.setItem(persistKey, JSON.stringify(state));
        } catch {
          /* ignore quota / privacy mode */
        }
      }
      listeners.forEach((l) => l());
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
