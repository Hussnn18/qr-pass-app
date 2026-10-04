import { useSyncExternalStore } from 'react';
import { buildSeed, SEED_VERSION } from '../data/seed';

/**
 * Mock "backend": the whole demo database lives in one object persisted to localStorage.
 * Every tab of the same browser shares it (storage events), so a student tab, an organizer
 * tab and a scanner tab update each other live — like the real REST + SSE system would.
 */
const KEY = 'scems_demo_db';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.version === SEED_VERSION) return s;
    }
  } catch { /* storage unavailable or corrupt — fall through to a fresh seed */ }
  return buildSeed();
}

let state = load();
const listeners = new Set();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota or private mode */ }
}
function emit() {
  listeners.forEach((l) => l());
}
save();

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      state = JSON.parse(e.newValue);
      emit();
    } catch { /* ignore partial writes */ }
  });
}

export const store = {
  get: () => state,
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Runs fn on a draft copy, commits it, and returns whatever fn returned. */
  mutate(fn) {
    const draft = structuredClone(state);
    const result = fn(draft);
    state = draft;
    save();
    emit();
    return result;
  },
  reset() {
    state = buildSeed();
    save();
    emit();
  },
};

export function useStore(selector) {
  const s = useSyncExternalStore(store.subscribe, store.get);
  return selector ? selector(s) : s;
}
