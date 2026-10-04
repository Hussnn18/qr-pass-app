# Smart Campus Events — UI prototype

Clickable React prototype of the Major Project frontend, styled after the GNDEC academic portal (banner, grey menu bar with folder buttons, navy/maroon accents). Every screen from `plan.md` §9 is here, backed by a mock API so the flows can be reviewed before the Spring Boot backend exists.

## Run

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Sign in with a demo account from the login page (one click), or use URN `2302511` / password `demo`.

## Reviewing the UX

- **Demo tools** (bottom-right button): switch role, reset data, and a 14-step UX review checklist with "Go" links.
- **Several roles at once**: open a second tab and sign in as another role. Tabs share the same mock database, so a scan in the security tab appears live on the organizer's attendance screen.
- **Phone layout**: DevTools → device toolbar → 375 px. The banner switches to a compact header, the menu collapses, tables become cards, and the pass shows its QR first.
- **Dates move with the clock**: sample events are generated around the time you first open the app. If the "happening now" event has ended, a banner offers to regenerate.

## What's where

| Path | Purpose |
|---|---|
| `src/data/seed.js` | Sample data: 120+ students, 10 events in every state, real campus coordinates from OpenStreetMap |
| `src/store/actions.js` | Mock API — one function per endpoint in `plan.md` §8, with the same rules (eligibility, capacity, waitlist, scan checks) |
| `src/store/store.js` | In-browser database (localStorage, synced across tabs) |
| `src/pages/*` | Screens grouped by role: `auth`, `participant`, `organizer`, `security`, `admin`, `common` |
| `src/components/*` | Shared UI: portal header/menu, pass card, campus map, charts, toasts, confirm dialog |
| `src/styles/theme.css` | Portal theme on top of Bootstrap 5 |

## Moving to the real backend

Pages only call functions in `src/store/actions.js` and read through `useStore`. Replace those with Axios calls to the Spring Boot API (`/api/v1/...`) and TanStack Query hooks; the page components can stay as they are.

## Prototype shortcuts (deliberate)

- Data lives in the browser; passwords are not hashed. Every demo account uses `demo`.
- "Excel" exports are CSV files; "PDF" uses the browser's print dialog. The real backend uses Apache POI and OpenPDF.
- The camera scanner needs `https://` or `localhost`. On a phone over plain LAN `http`, use manual entry or the demo scan buttons.
- The SSE live feed is simulated with cross-tab storage events.
