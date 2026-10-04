import { useCallback, useEffect, useState } from 'react';
import { api } from './client';

/**
 * Loads `path` and keeps { data, error, loading }. Pass null to skip. `poll` (ms) re-fetches on an
 * interval, e.g. live counters on the scanner. `reload()` fetches again after a change.
 */
export function useApi(path, { poll = 0 } = {}) {
  const [state, setState] = useState({ data: undefined, error: null, loading: !!path });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!path) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    api(path)
      .then((data) => {
        if (alive) setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (alive) setState((s) => ({ data: s.data, error, loading: false }));
      });
    return () => {
      alive = false;
    };
  }, [path, tick]);

  useEffect(() => {
    if (!poll || !path) return undefined;
    const t = setInterval(reload, poll);
    return () => clearInterval(t);
  }, [poll, path, reload]);

  const setData = useCallback((d) => setState((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })), []);
  return { ...state, reload, setData };
}
