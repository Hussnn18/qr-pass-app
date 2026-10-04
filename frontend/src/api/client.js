/**
 * Talks to the Spring Boot API (/api/v1). The access token lives only in memory; the refresh token is an
 * httpOnly cookie the browser sends to /api/v1/auth/refresh. When a request gets 401, the client refreshes
 * once and retries.
 */
let accessToken = null;
let refreshing = null;
const listeners = new Set();

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.detail || (status >= 500 ? 'The server had a problem. Please try again.' : `Request failed (${status}).`));
    this.status = status;
    this.code = body?.code;
    this.errors = body?.errors || {};
  }
}

export const onAuthEvent = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const emit = (evt) => listeners.forEach((l) => l(evt));

export function setAccessToken(token) {
  accessToken = token;
}

async function body(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Exchanges the refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession() {
  if (!refreshing) {
    refreshing = fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin' })
      .then(async (res) => {
        const data = await body(res);
        if (!res.ok) throw new ApiError(res.status, data);
        accessToken = data.accessToken;
        emit({ type: 'session', user: data.user });
        return data;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

/**
 * api('/events')                         GET → parsed JSON
 * api('/events/1/registrations', { method: 'POST', body: {...} })
 * api('/me/photo', { method: 'POST', form: formData })
 * api('/passes/1/pdf', { raw: true })    → the fetch Response (for files)
 */
export async function api(path, { method = 'GET', body: json, form, raw = false, retry = true } = {}) {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let payload;
  if (form) payload = form;
  else if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(json);
  }
  let res;
  try {
    res = await fetch(`/api/v1${path}`, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, { detail: "Can't reach the server. Check that the backend is running and you're online." });
  }
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    try {
      await refreshSession();
    } catch {
      accessToken = null;
      emit({ type: 'expired' });
      throw new ApiError(401, { detail: 'Your session has ended. Please sign in again.' });
    }
    return api(path, { method, body: json, form, raw, retry: false });
  }
  if (!res.ok) {
    const data = await body(res);
    if (data?.code === 'PASSWORD_CHANGE_REQUIRED') emit({ type: 'password-change' });
    throw new ApiError(res.status, data);
  }
  if (raw) return res;
  if (res.status === 204) return null;
  const type = res.headers.get('content-type') || '';
  return type.includes('json') ? res.json() : res.text();
}

/** Downloads a protected file (PDF, CSV) using the access token. */
export async function download(path, fallbackName) {
  const res = await api(path, { raw: true });
  const disposition = res.headers.get('content-disposition') || '';
  const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Builds a query string, skipping empty values. */
export function qs(params) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}
