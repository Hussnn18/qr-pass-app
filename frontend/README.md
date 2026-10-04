# Frontend — React

React 19 + Vite + React-Bootstrap, styled after the GNDEC academic portal (banner, grey menu bar with folder buttons, navy/maroon accents).

```bash
npm install
npm run dev       # http://localhost:5173, proxies /api to http://localhost:8080
npm run build     # production build in dist/
```

Set `API_URL` to proxy to a backend elsewhere, e.g. `API_URL=http://192.168.1.20:8080 npm run dev`. With `host: true`, phones on the same Wi-Fi can open the dev server. The camera scanner needs `https://` or `localhost`; otherwise use manual entry.

In production there is no separate frontend host: the root [Dockerfile](../Dockerfile) builds this site and Spring Boot serves it from the same URL as the API (see [DEPLOY.md](../DEPLOY.md)). That's why the client calls relative `/api/v1/...` paths.

## Layout

| Path | Purpose |
|---|---|
| `src/api/client.js` | `fetch` wrapper: bearer token in memory, silent refresh on 401, file downloads, `ApiError` with field errors |
| `src/api/useApi.js` | `useApi(path, { poll })` → `{ data, error, loading, reload }` |
| `src/auth/AuthContext.jsx` | session state; restores the session from the refresh cookie on load |
| `src/pages/*` | screens by role: `auth`, `participant`, `organizer`, `security`, `admin`, `common` |
| `src/components/*` | portal header and menu, pass card, event card, toasts, confirm dialog, shared UI |
| `src/data/constants.js` | labels, colours and icons for statuses, roles and categories |
| `src/styles/theme.css` | portal theme on top of Bootstrap 5 |

The demo-account buttons on the login page only show in dev builds (`import.meta.env.DEV`).
