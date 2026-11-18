# Smart Campus Events — GNDEC

Major Project: event management with secure QR entry passes. All five objectives of the synopsis are implemented (plans: [plan.md](plan.md) for 1–3, [docs/objectives-4-5.md](docs/objectives-4-5.md) for 4–5):

1. **Events** — venues and gates, event creation with schedule and eligibility rules, lifecycle, participant lists and CSV export.
2. **Accounts and registration** — role-based login (JWT), bulk student import, eligibility checks, approval and waitlist flows with race-free seat counting.
3. **QR passes and gate scanning** — signed, single-use passes (PNG/PDF), camera or manual verification at assigned gates, full scan log.
4. **Attendance and campus map** — attendance built from gate entries (present, absent, no-shows, per gate and over time), a live feed pushed from the server, manual corrections with a reason, and an interactive OpenStreetMap campus map with venues, upcoming events and walking directions.
5. **Dashboards, analytics and reports** — admin and organizer dashboards (department-, semester- and category-wise participation, popularity, trends, busiest gates), Excel/PDF/CSV reports, and an audit-log viewer.

| Folder | What |
|---|---|
| [backend/](backend/) | Spring Boot 4 REST API, MySQL or Supabase (PostgreSQL) + Flyway |
| [frontend/](frontend/) | React 19 + Vite, styled after the GNDEC portal; Leaflet map, Recharts charts |
| [tools/loadtest/](tools/loadtest/) | Gate-scanner load test |
| [docs/](docs/) | Plan for objectives 4–5 and the test results |
| [qr-pass-app/](qr-pass-app/) | The Minor project (Node + SQLite), kept for reference. Also tagged `minor-final`. |

**Deploying:** one Render web service runs the API and serves the site, with the database on Supabase. Step-by-step: [DEPLOY.md](DEPLOY.md).

## Quick start

Requirements: JDK 21+, Node 20.19+ or 22.12+, and one database: local MySQL 8, a free Supabase project, or neither (H2 option).

**1. Set up a database (once)** — pick one:

- **MySQL** (local, matches the synopsis). As MySQL root:

  ```bash
  mysql -u root -p < backend/db/create-database.sql
  ```

  This creates the `smart_campus_events` database and the `scems_app` user.

- **Supabase** (hosted PostgreSQL, shared by the whole team). Create a project at supabase.com (region: Southeast Asia, Singapore, next to the Render server). Then in the project click **Connect → Session pooler**, copy [backend/.env.example](backend/.env.example) to `backend/.env`, and fill in the host, user and database password. `.env` is git-ignored.

Either way, Flyway creates the tables on the backend's first start and demo data is loaded.

**2. Start the backend** (port 8080). Use `mvnw.cmd` in cmd/PowerShell:

```bash
cd backend && ./mvnw spring-boot:run
```

For Supabase, add the profile:

```bash
cd backend && ./mvnw spring-boot:run -Dspring-boot.run.profiles=supabase
```

No database at all? Run on an in-memory one instead. It is wiped and reseeded on every restart:

```bash
cd backend && ./mvnw spring-boot:run -Dspring-boot.run.profiles=h2
```

**3. Start the frontend** (port 5173, proxies `/api` to the backend):

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:5173 and pick a demo account on the login page. All demo accounts use the password `demo`.

| Role | Sign in with |
|---|---|
| Student | URN `2302511` (Simran Kaur) |
| Student, first sign-in | `arjun.mehta@gndec.demo` (must set a new password) |
| Organizer | `harjit.kaur@gndec.demo` |
| Security | `gurmeet.security@gndec.demo` (on duty at the live event) |
| Admin | `admin@gndec.demo` |

The demo data is created relative to the current time, so one event is always "happening now" right after the first start.

## Tests

```bash
cd backend && ./mvnw test
```

```bash
cd frontend && npm test
```

49 backend integration tests cover the plan's test list, attendance, analytics, reports, the campus map, the audit log and the deployment setup, including 50 parallel registrations for 10 seats and 5 parallel scans of one pass. They run on H2 by default; `./mvnw test -Ddb=postgres` runs the same tests on a real PostgreSQL 17 (downloaded once, no install needed), laid out exactly like the Supabase setup. 10 frontend tests cover the API client (including the live-feed stream parser) and shared helpers.

The gate-scanner load test and its results are in [docs/TESTING.md](docs/TESTING.md).
