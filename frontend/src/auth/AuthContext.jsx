import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, onAuthEvent, refreshSession, setAccessToken } from '../api/client';

const AuthContext = createContext(null);

/**
 * Holds the signed-in user. On page load it tries the refresh cookie, so a reload keeps you signed in
 * without storing tokens in localStorage.
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ ready: false, user: null });

  useEffect(() => {
    let alive = true;
    refreshSession()
      .then((d) => alive && setState({ ready: true, user: d.user }))
      .catch(() => alive && setState({ ready: true, user: null }));
    const off = onAuthEvent((evt) => {
      if (evt.type === 'expired') setState({ ready: true, user: null });
      if (evt.type === 'session') setState((s) => ({ ...s, user: evt.user }));
      if (evt.type === 'password-change') setState((s) => (s.user ? { ...s, user: { ...s.user, mustChangePassword: true } } : s));
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  const applySession = useCallback((d) => {
    setAccessToken(d.accessToken);
    setState({ ready: true, user: d.user });
    return d.user;
  }, []);

  const login = useCallback(
    async (identifier, password) => applySession(await api('/auth/login', { method: 'POST', body: { identifier, password } })),
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* already signed out */
    }
    setAccessToken(null);
    setState({ ready: true, user: null });
  }, []);

  const setUser = useCallback((user) => setState((s) => ({ ...s, user })), []);

  const value = useMemo(() => ({ ...state, login, logout, applySession, setUser }), [state, login, logout, applySession, setUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
export const useCurrentUser = () => useContext(AuthContext).user;
