import { useSyncExternalStore } from 'react';
import { useStore } from './store';

/** Logged-in user id, kept per browser tab so each tab can act as a different role. */
const KEY = 'scems_session';

function read() {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}

let current = read();
const listeners = new Set();

export const session = {
  get: () => current,
  set(userId) {
    current = userId || null;
    try {
      if (current) sessionStorage.setItem(KEY, current);
      else sessionStorage.removeItem(KEY);
    } catch { /* storage unavailable */ }
    listeners.forEach((l) => l());
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export const useSessionUserId = () => useSyncExternalStore(session.subscribe, session.get);

export function useCurrentUser() {
  const id = useSessionUserId();
  return useStore((s) => s.users.find((u) => u.id === id) || null);
}
