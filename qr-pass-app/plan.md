# Major Project Plan — Smart Campus Event Management and Secure QR Access System

Upgrade path from the **Minor Project** (`qr-pass-app`, Node.js + SQLite) to the **Major Project** described in `Major_Synopsis.pdf` (Java Spring Boot + React.js + MySQL).

> **Short version:** this is a full rewrite, not an extension. The synopsis changes the backend language, database, frontend framework and security model, and adds five new modules (roles, gates, campus map, analytics/reports, audit/notifications). We keep the Minor's *features and UX ideas* as a parity checklist, and treat its *security weaknesses* as the requirements the new system must fix.

---

## Table of contents

1. [Where we are vs. where we need to be](#1-where-we-are-vs-where-we-need-to-be)
2. [Target tech stack](#2-target-tech-stack)
3. [Repository restructure](#3-repository-restructure)
4. [Roles and permissions](#4-roles-and-permissions)
5. [Functional requirements](#5-functional-requirements)
6. [Non-functional requirements](#6-non-functional-requirements)
7. [Database design](#7-database-design)
8. [REST API plan](#8-rest-api-plan)
9. [Frontend plan (React)](#9-frontend-plan-react)
10. [QR pass and verification design](#10-qr-pass-and-verification-design)
11. [Problems in the Minor code the Major must fix](#11-problems-in-the-minor-code-the-major-must-fix)
12. [Implementation phases (task checklists)](#12-implementation-phases-task-checklists)
13. [Timeline](#13-timeline)
14. [Testing plan](#14-testing-plan)
15. [Deployment plan](#15-deployment-plan)
16. [Seed data and migration from the Minor](#16-seed-data-and-migration-from-the-minor)
17. [Report and documentation deliverables](#17-report-and-documentation-deliverables)
18. [Environment setup checklist](#18-environment-setup-checklist)
19. [Open questions to settle](#19-open-questions-to-settle)

---

## 1. Where we are vs. where we need to be

### 1.1 What the Minor already does (feature parity checklist)

Every item below must still work in the Major build.

| # | Minor feature | Where it lives now |
|---|---|---|
| P1 | Student login with URN + password | `server.js` `/api/login`, `public/app.js` |
| P2 | Student changes password, uploads own photo | `/api/students/:urn/password`, `/api/students/:urn/photo` |
| P3 | Event list filtered by eligibility (department / year / section) | `/api/events/available/:urn`, `isEligible()` |
| P4 | Self-registration with capacity limit and **waitlist** | `/api/events/:id/register/:urn` |
| P5 | "Auto-assigned" events: admin issues passes to all eligible students | `/api/admin/events/:id/assign` |
| P6 | Digital pass card with QR + **Download PDF** (html2canvas + jsPDF) | `public/app.js` `renderPasses`, `printPass` |
| P7 | Admin event CRUD, close event, participant list | `/api/admin/events*` |
| P8 | Promote waitlisted; removing a participant auto-promotes next in waitlist | `/promote`, `DELETE .../participants/:urn` |
| P9 | Student CRUD, **bulk CSV import**, enrollment toggle, photo upload | `/api/admin/students*`, `sample_students.csv` |
| P10 | Scanner page using camera (html5-qrcode), manual pass-ID entry, scan history | `public/scanner.html`, `scanner.js` |
| P11 | Scanner pairing: admin shows a QR/link, phone becomes a scanner device | `scannerToken`, `/api/scanner/verify-token` |
| P12 | **Live scan feed** on admin panel (Server-Sent Events) | `/api/admin/live-sync` |
| P13 | Duplicate-entry rejection ("Already Used") | `/api/verify` |
| P14 | Photo shown to gate staff on successful scan | `/api/verify` response |
| P15 | LAN IP discovery to share the scanner link | `/api/server-info` |

### 1.2 Gap analysis — synopsis vs. Minor

| Area | Synopsis requires | Minor has | Work needed |
|---|---|---|---|
| Backend | Java, Spring Boot, Spring MVC, Maven | Node.js / Express 5, one 478-line `server.js` | **Rewrite** in layered Spring Boot |
| Database | MySQL + Spring Data JPA / Hibernate | SQLite, schema changed with ad-hoc `ALTER TABLE` | **New relational schema**, versioned with Flyway |
| Frontend | React.js + Bootstrap (or equivalent) | Vanilla HTML/CSS/JS, 3 pages | **Rewrite** in React |
| Authentication | Spring Security, secure session/token | Plaintext passwords, no tokens, admin APIs open to anyone | JWT + BCrypt + method-level RBAC |
| Roles | Admin, Organizer, Student, Outsider/Guest, Security | Admin, Student, and an anonymous "scanner device" | Add **Organizer, Guest, Security** |
| Events | Scheduling, venue, capacity, eligibility | Name, date, time, free-text venue, capacity, audience JSON | Port + venue foreign key, description, category, registration window, lifecycle states |
| Eligibility | Event-specific rules, automated check | Department / year / section; **fails open** on error | Port, add **semester**, outsider flag, fail closed, show reasons to user |
| Registration | Register, approved / rejected / cancelled | Register, waitlist, admin promote/remove | Add **approval mode**, reject, **self-cancel** |
| Digital pass | Unique pass + QR; data stays in DB | UUID embedded in a public `/verify/<id>` URL | Opaque random token; QR + PDF generated in Java |
| Verification | Server-side checks of event, status, validity, reuse | `/api/verify` (race-prone) + **public `/verify/:id` that records attendance with no login** | Authenticated, atomic scan endpoint |
| Attendance | Recorded with event, **gate** and timestamp | `scan_logs` with device name only | `attendance` table + **gates** |
| Campus map | Interactive map, events linked to venues | None (venue is text) | **New module** |
| Analytics | Dashboards; department-wise, semester-wise, popularity, gate-wise | Confirmed/waitlisted counts per event | **New module** |
| Reports | Event-wise reports | None | CSV / Excel / PDF exports |
| Audit logging | Audit records of important activities | None | **New module** |
| Notifications | Listed as a backend module | None | In-app + email |
| Outsiders | Register for events that allow external participants | None | Guest sign-up with email verification |
| Mobile-ready API | REST API reusable by a future Android app | Partly (mixed HTML + JSON routes) | Versioned REST (`/api/v1`) + OpenAPI docs |
| Testing | Unit, integration, auth, QR duplicate, DB, UI, security, performance | None (`npm test` is a placeholder) | Full test plan (§14) |

The Minor's own `Project_Evaluation_Report.html` lists bcrypt, JWT, pagination, scan race conditions, toast notifications, ID-card passes, attendance export, email notifications, charts and RBAC as next steps. All of them are covered by this plan.

---

## 2. Target tech stack

Pinned choices so the team doesn't mix tutorials across versions.

| Layer | Choice | Notes |
|---|---|---|
| Language | **Java 21 (LTS)** | |
| Framework | **Spring Boot** (latest stable from start.spring.io) | Starters: Web, Security, Data JPA, Validation, Mail, OAuth2 Resource Server, Actuator |
| Build | **Apache Maven** (wrapper `mvnw` committed) | |
| Database | **MySQL 8** | Local install + MySQL Workbench (as in synopsis); Docker optional |
| ORM | Spring Data JPA + Hibernate | `ddl-auto=validate`; schema owned by Flyway |
| Migrations | **Flyway** | `V1__init.sql`, `V2__...` — no more manual `ALTER TABLE` |
| Auth | Spring Security + **JWT** (Spring's built-in resource-server JWT support, HMAC key) | Short-lived access token + refresh token in an httpOnly cookie |
| Passwords | BCrypt (`PasswordEncoder`) | |
| QR generation | **ZXing** (`com.google.zxing:core`, `javase`) | PNG generated on the server |
| Pass PDF | **OpenPDF** | Server-side ID-card-style pass |
| Excel / CSV | **Apache POI** (xlsx), plain CSV writer | Import students, export reports |
| API docs | **springdoc-openapi** (Swagger UI) | Doubles as documentation for the future Android client |
| Boilerplate | Lombok, MapStruct (optional) | DTOs, never return JPA entities |
| Real-time | Spring `SseEmitter` | Live scan feed (keeps Minor behaviour) |
| Frontend | **React + Vite**, React Router | |
| UI | **React-Bootstrap** (Bootstrap 5) | Matches "Bootstrap or equivalent" |
| HTTP client | Axios (interceptor for token refresh) + TanStack Query | |
| QR scanning | **html5-qrcode** | Camera needs HTTPS — see §15 |
| Map | **react-leaflet** + OpenStreetMap tiles | Venue markers from DB coordinates |
| Charts | **Recharts** | |
| Toasts | react-hot-toast (or Bootstrap Toast) | Fixes "sparse alerts" from the Minor evaluation |
| Live feed client | `@microsoft/fetch-event-source` | `EventSource` can't send the JWT header |
| Tests | JUnit 5, Mockito, MockMvc, Testcontainers (MySQL); Vitest + React Testing Library; Playwright (stretch); k6 or JMeter (load) | |
| Version control | Git + GitHub | |

---

## 3. Repository restructure

Target layout (monorepo):

```
Major_Project/                      (rename of Minor_Project, or keep folder name)
├── backend/                        Spring Boot (Maven)
│   ├── pom.xml, mvnw
│   └── src/main/java/<base>/eventqr/
│       ├── config/                 SecurityConfig, CorsConfig, OpenApiConfig, JwtConfig
│       ├── common/                 exceptions, ApiError, pagination, BaseEntity
│       ├── auth/                   login, refresh, guest sign-up, password reset
│       ├── user/                   User, StudentProfile, GuestProfile, Department
│       ├── campus/                 CampusLocation, Gate
│       ├── event/                  Event, eligibility rules, lifecycle
│       ├── registration/           Registration, waitlist, approval
│       ├── pass/                   Pass, QR + PDF generation
│       ├── scan/                   verification, ScanLog, Attendance, SSE
│       ├── analytics/              aggregate queries, DTOs
│       ├── report/                 CSV/XLSX/PDF exports
│       ├── notification/           in-app + email
│       └── audit/                  AuditLog, AuditService
│   └── src/main/resources/
│       ├── application.yml, application-dev.yml, application-prod.yml
│       └── db/migration/           Flyway scripts
├── frontend/                       React + Vite
│   └── src/{api,auth,components,layouts,pages/{public,participant,organizer,security,admin},hooks,utils}
├── docs/                           this plan, SRS, diagrams, API notes, report drafts
├── legacy/qr-pass-app/             the Minor project, frozen (delete after parity is confirmed)
├── docker-compose.yml              MySQL (+ backend + frontend for deployment)
└── README.md
```

Steps:

- [ ] Tag the current commit before touching anything: `git tag minor-final && git push --tags`.
- [ ] Move `qr-pass-app/` → `legacy/qr-pass-app/`; move this `plan.md` → `docs/plan.md`.
- [ ] Add root `.gitignore` entries for Java (`target/`, `*.class`, `.idea/`) and React (`node_modules/`, `dist/`).
- [ ] Secrets (DB password, JWT secret, SMTP password) go in env variables or an untracked `application-local.yml` — **never committed**.
- [ ] Delete dev leftovers that won't be ported: `reset_passes.js`, `verify_db.js`, `test_scan.json`, `.vscode/settings.json` (Live Server port).

---

## 4. Roles and permissions

| Capability | Admin | Organizer | Student | Guest (outsider) | Security |
|---|:-:|:-:|:-:|:-:|:-:|
| Manage users, assign roles | ✔ | | | | |
| Import students (CSV/XLSX), toggle enrollment | ✔ | | | | |
| Manage departments, campus locations, gates | ✔ | | | | |
| Create / edit / publish / cancel events | ✔ all | ✔ own | | | |
| Set capacity, eligibility, registration mode | ✔ | ✔ own | | | |
| Approve / reject / promote / bulk-assign registrations | ✔ | ✔ own | | | |
| Assign security staff to event gates | ✔ | ✔ own | | | |
| Browse events | ✔ | ✔ | eligible | outsider-allowed only | assigned |
| Check own eligibility, register, cancel | | | ✔ | ✔ | |
| View / download own pass and QR | | | ✔ | ✔ | |
| Scan and verify passes | ✔ | ✔ own events | | | ✔ assigned gate |
| Manual attendance override (with reason) | ✔ | ✔ own | | | |
| Live scan feed | ✔ | ✔ own | | | own gate |
| Analytics dashboards | system-wide | own events | | | |
| Export reports | ✔ | ✔ own | | | |
| View audit logs | ✔ | | | | |
| View campus map | ✔ | ✔ | ✔ | ✔ | ✔ |
| Edit own profile / photo / password | ✔ | ✔ | ✔ | ✔ | ✔ |

Account creation:

- **Admin** — seeded on first run (password forced to change on first login).
- **Organizer, Security** — created by Admin.
- **Student** — imported by Admin (CSV/XLSX) or created individually; **must change the temporary password on first login**.
- **Guest** — self sign-up with email verification (OTP or link); can only see events with `allow_outsiders = true`.

Enforce with `@PreAuthorize` on service/controller methods **and** ownership checks (an organizer can only touch events where they are an organizer).

---

## 5. Functional requirements

IDs are for traceability in the report and test cases.

### 5.1 Authentication and user management (Phase 2)

- **FR-AUTH-1** Login with URN (students) or email/username (others) + password; returns access token + refresh cookie.
- **FR-AUTH-2** Token refresh, logout (refresh token revoked).
- **FR-AUTH-3** Guest sign-up with email verification.
- **FR-AUTH-4** Forgot / reset password via emailed one-time code.
- **FR-AUTH-5** Forced password change on first login for imported/created accounts.
- **FR-AUTH-6** Lock account for 15 minutes after 5 failed logins; failed logins written to audit log.
- **FR-USER-1** Profile view/edit; profile photo upload (JPEG/PNG, ≤ 2 MB, server-side type check).
- **FR-USER-2** Admin CRUD for users of every role; deactivate instead of hard delete.
- **FR-USER-3** Bulk student import (CSV and XLSX) with per-row validation report (added / skipped + reason).
- **FR-USER-4** Departments master table (code, name).
- **FR-USER-5** Student profile: URN, department, **semester (1–8)**, section, batch, DOB, phone, photo, enrollment status.

### 5.2 Events (Phase 3)

- **FR-EVT-1** Create/edit event: title, description, category (technical, cultural, sports, academic, other), banner image, venue (from campus locations), start/end date-time, registration open/close date-time, capacity.
- **FR-EVT-2** Registration mode per event:
  - `OPEN` — first come, auto-approved until capacity, then waitlist (Minor's `registration_based`)
  - `APPROVAL` — organizer approves or rejects each request (new)
  - `AUTO_ASSIGN` — organizer issues passes to all eligible students (Minor's `auto_assigned`)
- **FR-EVT-3** Eligibility rules: departments, semesters, sections, `allow_outsiders`. Empty list = no restriction on that field. Rule evaluation **fails closed**.
- **FR-EVT-4** Lifecycle: `DRAFT → PUBLISHED → CLOSED (registrations closed) → COMPLETED`, or `CANCELLED` from any non-completed state. Cancelling revokes all passes and notifies registrants.
- **FR-EVT-5** Multiple organizers per event (co-organizers).
- **FR-EVT-6** Gates per event (chosen from gates of the venue) and security staff assigned to gates.
- **FR-EVT-7** Event browse with search, category/date filters, pagination; each card shows remaining seats and eligibility badge.

### 5.3 Registration (Phase 3)

- **FR-REG-1** Eligibility check endpoint returns `eligible: true/false` plus human-readable reasons ("Only CSE and ECE", "Semester 5–6 only").
- **FR-REG-2** Register only inside the registration window, only if eligible, one registration per user per event (DB unique constraint).
- **FR-REG-3** States: `PENDING`, `APPROVED`, `WAITLISTED`, `REJECTED`, `CANCELLED`.
- **FR-REG-4** Self-cancel until the event starts; cancelling an approved seat auto-promotes the first waitlisted user.
- **FR-REG-5** Organizer actions: approve, reject (with reason), promote, remove, bulk-assign.
- **FR-REG-6** Capacity can never be exceeded, even under concurrent requests.

### 5.4 Digital pass and QR (Phase 4)

- **FR-PASS-1** A pass is issued automatically when a registration becomes `APPROVED`.
- **FR-PASS-2** QR encodes only an opaque random token — no personal data, no URL that does anything when opened.
- **FR-PASS-3** Pass view: participant photo, name, URN/ID, department, event, date/time, venue, QR, pass status.
- **FR-PASS-4** Download pass as PDF (ID-card style, generated server-side).
- **FR-PASS-5** States: `ACTIVE`, `USED`, `REVOKED`, `EXPIRED`. Organizer can revoke and re-issue (new token, old one dead).
- **FR-PASS-6** Passes expire automatically after the event ends (scheduled job).

### 5.5 Verification, attendance and gates (Phase 5)

- **FR-SCAN-1** Security user picks an assigned event + gate, then scans continuously.
- **FR-SCAN-2** Server checks, in order: token exists → pass not revoked/expired → registration approved → pass belongs to the selected event → inside entry window (e.g. 60 min before start until end) → account active / student enrolled → not already used.
- **FR-SCAN-3** First valid scan marks the pass `USED` and creates an attendance record (event, gate, timestamp, scanned-by, device) **atomically**.
- **FR-SCAN-4** Every attempt (success or failure) is stored in `scan_logs` with its result code.
- **FR-SCAN-5** Result screen: large green / amber / red state, participant photo and name for visual match, reason text; sound + vibration.
- **FR-SCAN-6** Manual entry fallback (type pass code or URN) — audited.
- **FR-SCAN-7** Live scan feed for organizer/admin dashboards (SSE).
- **FR-SCAN-8** Organizer manual attendance override with mandatory reason — audited.
- **FR-SCAN-9** (Keep from Minor) Pair a phone as scanner by scanning a QR on the organizer/admin screen — now the QR carries a short-lived, single-use pairing code tied to a Security user, not a global token.

### 5.6 Campus map and venues (Phase 6)

- **FR-MAP-1** Campus locations table: name, type (academic block, admin block, lab, auditorium, seminar hall, library, sports, cafeteria, parking, other), building, floor, latitude, longitude, description, photo, `can_host_events`.
- **FR-MAP-2** Interactive map with markers, filter by type, search by name.
- **FR-MAP-3** Event detail page shows its venue on a mini-map; marker popup lists upcoming events at that venue.
- **FR-MAP-4** "Get directions" link (opens Google Maps with the coordinates).
- **FR-MAP-5** Admin places/moves markers by clicking on the map; manages gates per location.

### 5.7 Analytics and reports (Phase 7)

- **FR-ANL-1** Per event: total registrations, approved, rejected, cancelled, waitlisted, attended, no-shows, fill rate (approved / capacity), attendance rate (attended / approved).
- **FR-ANL-2** Student vs. guest participation.
- **FR-ANL-3** Department-wise and semester-wise participation.
- **FR-ANL-4** Event popularity ranking (registrations, fill rate).
- **FR-ANL-5** Gate-wise entries and entries-over-time (15-minute buckets) to show peak entry.
- **FR-ANL-6** Admin system dashboard (date range filter) and organizer per-event dashboard.
- **FR-RPT-1** Export registrations and attendance per event as CSV, XLSX and PDF.
- **FR-RPT-2** Summary report for a date range (all events).

### 5.8 Notifications and audit (Phase 7)

- **FR-NOT-1** In-app notifications: registration approved/rejected/waitlisted/promoted, event updated/cancelled, reminder 24 h before event.
- **FR-NOT-2** Email for the same events (can be switched off in config; stretch for reminders).
- **FR-AUD-1** Audit log of: login success/failure, password changes, user/role changes, student imports, event create/update/publish/cancel/delete, registration decisions, pass revoke/re-issue, manual scans, attendance overrides, report exports.
- **FR-AUD-2** Admin audit viewer with filters (actor, action, entity, date range).

---

## 6. Non-functional requirements

| ID | Requirement | How |
|---|---|---|
| NFR-SEC-1 | Passwords hashed | BCrypt |
| NFR-SEC-2 | Every non-public endpoint requires a valid JWT and the right role | Spring Security + `@PreAuthorize` + ownership checks |
| NFR-SEC-3 | No user can read/modify another user's data by changing an ID in the URL | Current user always taken from the token, never from the path |
| NFR-SEC-4 | Input validated server-side | Jakarta Bean Validation on DTOs |
| NFR-SEC-5 | No XSS | React escapes by default; never use `dangerouslySetInnerHTML` with user data |
| NFR-SEC-6 | CORS limited to the frontend origin | `CorsConfig` |
| NFR-SEC-7 | Login and scan endpoints rate-limited | Bucket4j or a simple in-memory limiter |
| NFR-SEC-8 | Uploaded files validated and given random names; photos served only to authorised users | |
| NFR-SEC-9 | Secrets not in Git | env vars / `application-local.yml` |
| NFR-REL-1 | No double entry, no over-capacity under concurrency | Atomic conditional updates + unique constraints (§10) |
| NFR-REL-2 | Consistent error format | `@RestControllerAdvice` returning `ProblemDetail` |
| NFR-PERF-1 | Scan verification p95 < 300 ms on LAN | Indexed token lookup, no N+1 queries |
| NFR-PERF-2 | All list endpoints paginated | Spring Data `Pageable` |
| NFR-USE-1 | Mobile-first responsive UI; scanner usable one-handed | Bootstrap grid, big result screen |
| NFR-USE-2 | Clear feedback | Toasts, loading and empty states |
| NFR-MNT-1 | Layered architecture (controller → service → repository), DTOs, modules per feature | §3 |
| NFR-MNT-2 | Schema versioned | Flyway |
| NFR-MNT-3 | API documented | Swagger UI at `/swagger-ui.html` |
| NFR-TIME-1 | Times stored in UTC, displayed in IST | `hibernate.jdbc.time_zone=UTC`, format on the client |
| NFR-PRIV-1 | Security staff see only what's needed to verify (photo, name, ID, department) | Scan response DTO |

---

## 7. Database design

MySQL 8, InnoDB, `utf8mb4`. All tables have `id BIGINT AUTO_INCREMENT` unless stated, plus `created_at` / `updated_at`.

| Table | Key columns | Constraints / notes |
|---|---|---|
| `users` | email, username, password_hash, full_name, phone, role (`ADMIN`,`ORGANIZER`,`STUDENT`,`GUEST`,`SECURITY`), status (`ACTIVE`,`INACTIVE`,`LOCKED`,`PENDING_VERIFICATION`), must_change_password, failed_login_count, locked_until, photo_path, last_login_at | unique(email), unique(username) |
| `departments` | code, name | unique(code) |
| `student_profiles` | user_id, urn, department_id, semester, section, batch, dob, enrolled | unique(urn), unique(user_id) |
| `guest_profiles` | user_id, organization, id_proof_type, email_verified_at | unique(user_id) |
| `campus_locations` | name, type, building, floor, latitude, longitude, description, photo_path, can_host_events, capacity | index(type) |
| `gates` | location_id, name, description | unique(location_id, name) |
| `events` | title, description, category, banner_path, venue_id → campus_locations, starts_at, ends_at, reg_opens_at, reg_closes_at, capacity, approved_count, registration_mode, allow_outsiders, status, created_by | check(ends_at > starts_at); `approved_count` maintained atomically |
| `event_organizers` | event_id, user_id | PK(event_id, user_id) |
| `event_eligible_departments` | event_id, department_id | PK(event_id, department_id) |
| `event_eligible_semesters` | event_id, semester | PK(event_id, semester) |
| `event_eligible_sections` | event_id, section | PK(event_id, section) |
| `event_gates` | event_id, gate_id | PK(event_id, gate_id) |
| `security_assignments` | event_id, gate_id, user_id | unique(event_id, gate_id, user_id) |
| `registrations` | event_id, user_id, status, waitlist_position, registered_at, decided_at, decided_by, rejection_reason, cancelled_at | **unique(event_id, user_id)**; index(event_id, status) |
| `passes` | registration_id, token_hash, status, issued_at, used_at, revoked_at, revoked_reason | **unique(token_hash)**; one ACTIVE pass per registration |
| `attendance` | registration_id, pass_id, event_id, gate_id, checked_in_at, checked_in_by, method (`QR`,`MANUAL`,`OVERRIDE`), note | **unique(registration_id)** — DB-level guarantee of single entry |
| `scan_logs` | event_id, gate_id, pass_id (nullable), scanned_by, device_id, result (`SUCCESS`,`INVALID_TOKEN`,`ALREADY_USED`,`WRONG_EVENT`,`REVOKED`,`EXPIRED`,`NOT_APPROVED`,`OUTSIDE_WINDOW`,`ACCOUNT_INACTIVE`), scanned_at | index(event_id, scanned_at), index(gate_id) |
| `scanner_pairings` | code_hash, user_id, event_id, gate_id, expires_at, used_at | single-use, ~5 min expiry |
| `notifications` | user_id, type, title, message, link, read_at | index(user_id, read_at) |
| `audit_logs` | actor_id (nullable), action, entity_type, entity_id, details (JSON), ip_address, user_agent, created_at | index(created_at), index(actor_id) |
| `refresh_tokens` | user_id, token_hash, expires_at, revoked_at | |
| `password_reset_codes` / `email_verifications` | user_id, code_hash, expires_at, used_at | |

Relationships (for the ER diagram):

```
User 1──1 StudentProfile ──* Department
User 1──1 GuestProfile
User *──* Event (organizers)        Event *──1 CampusLocation (venue)
User 1──* Registration *──1 Event   CampusLocation 1──* Gate
Registration 1──* Pass (only one ACTIVE)
Registration 1──0..1 Attendance *──1 Gate
Event *──* Gate (event_gates)       SecurityAssignment = (Event, Gate, User)
ScanLog *──1 Event, Gate, Pass?, User(scanned_by)
```

---

## 8. REST API plan

Base path `/api/v1`. JSON everywhere. Lists accept `page`, `size`, `sort`. Errors use `ProblemDetail`.

**Auth** (public)
- `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout`
- `POST /auth/guest/register` · `POST /auth/guest/verify`
- `POST /auth/password/forgot` · `POST /auth/password/reset`

**Me** (any logged-in user)
- `GET /me` · `PUT /me` · `PUT /me/password` · `POST /me/photo`
- `GET /me/registrations` · `GET /me/passes` · `GET /me/notifications` · `PATCH /me/notifications/{id}/read`

**Admin — users**
- `GET|POST /admin/users` · `GET|PATCH /admin/users/{id}` · `PATCH /admin/users/{id}/status`
- `POST /admin/students/import` (multipart CSV/XLSX → import report) · `PATCH /admin/students/{id}/enrollment`
- `GET|POST|PUT|DELETE /admin/departments[/{id}]`

**Campus**
- `GET /campus/locations?type=&q=` · `GET /campus/locations/{id}` (incl. upcoming events)
- `POST|PUT|DELETE /admin/campus/locations[/{id}]` · `GET|POST|DELETE /admin/campus/locations/{id}/gates[/{gateId}]`

**Events**
- `GET /events?q=&category=&from=&to=&status=` (participants see only eligible/visible ones)
- `GET /events/{id}` · `GET /events/{id}/eligibility`
- `POST /events` · `PUT /events/{id}` · `DELETE /events/{id}` (draft only)
- `POST /events/{id}/publish` · `/close` · `/cancel` · `/complete`
- `PUT /events/{id}/organizers` · `PUT /events/{id}/gates` · `PUT /events/{id}/security-assignments`

**Registrations**
- `POST /events/{id}/registrations` (self) · `POST /registrations/{id}/cancel` (self)
- `GET /events/{id}/registrations?status=` (organizer)
- `POST /registrations/{id}/approve` · `/reject` · `/promote` · `DELETE /registrations/{id}` (organizer remove)
- `POST /events/{id}/registrations/bulk-assign` (all eligible, or a list of URNs)

**Passes**
- `GET /passes/{id}` · `GET /passes/{id}/qr.png` · `GET /passes/{id}/pdf` (owner, organizer, admin)
- `POST /passes/{id}/revoke` · `POST /passes/{id}/reissue` (organizer)

**Scanning** (security / organizer / admin)
- `GET /scan/assignments` (my events + gates for today)
- `POST /scan/pairings` (organizer creates pairing QR) · `POST /scan/pairings/redeem` (phone redeems → scanner session)
- `POST /scan/verify` `{ token, eventId, gateId, deviceId }` → `{ result, message, participant{name, id, department, photoUrl}, checkedInAt }`
- `POST /scan/manual` `{ eventId, gateId, passCode | urn, reason }`
- `GET /scan/history?eventId=&gateId=`

**Attendance**
- `GET /events/{id}/attendance` · `POST /events/{id}/attendance/override`
- `GET /events/{id}/live` (SSE stream)

**Analytics** (organizer: own events; admin: all)
- `GET /analytics/overview?from=&to=` · `GET /analytics/events/{id}`
- `GET /analytics/participation/departments` · `/semesters` · `/user-types`
- `GET /analytics/popularity` · `GET /analytics/events/{id}/gates` · `GET /analytics/events/{id}/timeline`

**Reports**
- `GET /reports/events/{id}/registrations?format=csv|xlsx|pdf`
- `GET /reports/events/{id}/attendance?format=csv|xlsx|pdf`
- `GET /reports/summary?from=&to=&format=...`

**Audit**
- `GET /admin/audit-logs?actor=&action=&entity=&from=&to=`

---

## 9. Frontend plan (React)

Shared: role-based layouts (sidebar on desktop, bottom nav on mobile), `ProtectedRoute` by role, Axios client with silent refresh, toast system, loading skeletons and empty states, forced-password-change gate.

| Area | Pages |
|---|---|
| Public | Login · Guest sign-up · Email verify · Forgot / reset password · Campus map (read-only) |
| Student / Guest | Dashboard (next events, notifications) · Browse events (filters, eligibility badge, seats left) · Event detail (mini-map, register / cancel, status) · My registrations · My passes (QR full-screen, "turn brightness up" hint, PDF download) · Campus map · Profile |
| Organizer | Dashboard (my events + key numbers) · Event wizard (details → venue → schedule → capacity & mode → eligibility → gates & security) · Registrations (approve / reject / promote / bulk assign, filters, export) · Live attendance (SSE feed, counters) · Event analytics · Scanner pairing QR |
| Security | Assignment picker (event + gate) · Scanner (camera, full-screen result, sound/vibrate, manual entry) · Recent scans |
| Admin | System dashboard · Users (tabs per role) · Student import (upload, preview, result report) · Departments · Campus locations & gates (click map to place) · All events · Audit log · Reports |

Reuse from the Minor: pass-card visual design (`public/styles.css`), the scanner result screen layout, and the live-feed widget — re-implemented as React components.

**Prototype:** every page in this table already exists as a clickable demo with mock data in [`frontend/`](../frontend/README.md) (React + Vite + React-Bootstrap, GNDEC portal styling). Use it for UI/UX review, then swap `src/store/actions.js` for real API calls in Phase 2 onwards.

---

## 10. QR pass and verification design

This is the core of the project; the report should explain it in detail.

**Token**
- On approval, server generates 32 random bytes (`SecureRandom`), Base64URL-encodes it → `token`. Only `SHA-256(token)` is stored in `passes.token_hash`.
- QR content: `EQR1:<token>` (prefix lets the scanner reject random QR codes instantly and lets us change the format later).
- The QR is **not a URL**. Opening it with a phone camera does nothing — fixing the Minor bug where any phone that scanned a pass marked it used (§11).

**Verify (`POST /scan/verify`)** inside one `@Transactional` method:

1. Caller must be SECURITY assigned to `(eventId, gateId)` (or organizer of the event, or admin).
2. Look up pass by `sha256(token)`; missing → `INVALID_TOKEN`.
3. Check pass status, registration status, event match, entry time window, account/enrollment → specific result code.
4. **Atomic claim:** `UPDATE passes SET status='USED', used_at=now() WHERE id=? AND status='ACTIVE'`. If 0 rows changed → `ALREADY_USED` (another gate won the race).
5. Insert `attendance` (unique on `registration_id` = second safety net).
6. Insert `scan_logs` row for every outcome; push SSE event to dashboards.
7. Return minimal participant info (photo, name, ID, department) so the guard can match the face.

**Capacity without races (registration)**
- `UPDATE events SET approved_count = approved_count + 1 WHERE id=? AND approved_count < capacity` → 1 row = seat taken, 0 rows = waitlist. Decrement on cancel/remove, then promote the first waitlisted user in the same transaction.

**Stretch options** (only after MVP works)
- Rotating QR: client shows `HMAC(token, 30-second window)`, so screenshots forwarded to friends expire quickly.
- Offline scanning: scanner caches the event's hashed tokens and syncs results later.
- Re-entry events: allow `IN/OUT` scans instead of single use.

---

## 11. Problems in the Minor code the Major must fix

Not worth patching in the Node app — but each one becomes a requirement and a test case in the Major build.

| # | Problem | Location | Major fix |
|---|---|---|---|
| 1 | Passwords stored and compared in plain text; default `admin/admin123` seeded | `database.js:84`, `server.js:64`, `server.js:84` | BCrypt, forced first-login change |
| 2 | **No authentication on any `/api/admin/*` route** — anyone on the network can delete events/students | `server.js:246-458` | JWT + `@PreAuthorize` |
| 3 | Student APIs trust the URN in the URL — anyone knowing a URN can fetch that student's QR passes, register them, or replace their photo | `server.js:100`, `:126`, `:144`, `:433` | Current user from token only |
| 4 | **Public `GET /verify/:passId` records attendance with no login and no duplicate check**; QR encodes this URL, so a student checking their own QR with a phone camera "uses" the pass | `server.js:213-222`, QR built at `server.js:117` | QR is an opaque token; only authenticated scan endpoint writes attendance |
| 5 | Duplicate-scan check is read-then-insert (two gates can both accept) | `server.js:199-205` | Atomic update + unique constraint |
| 6 | Capacity check is read-then-insert (over-booking under load) | `server.js:158-167` | Atomic counter update |
| 7 | Single global scanner token, held in memory, never expires, reset on restart | `server.js:12`, `:85`, `:90` | Per-user, short-lived, single-use pairing |
| 8 | Live scan feed (SSE) open to anyone | `server.js:230` | Authenticated SSE, scoped to event |
| 9 | XSS — user data inserted with `innerHTML` and into server-built HTML | `public/app.js:302-330`, `server.js:222` | React escaping |
| 10 | Eligibility check returns `true` on any error (fails open) | `server.js:52` | Fail closed + unit tests |
| 11 | Default password = first 4 letters of name + DOB — guessable | `server.js:376-377`, `:405-406` | Random temp password + forced change |
| 12 | Deleting an event/student leaves orphan `scan_logs` (SQLite FKs not enforced) | `server.js:282-283`, `:444-445` | Real FKs; soft delete/cancel instead of delete |
| 13 | N+1 queries when listing events | `server.js:133-138`, `:250-253` | Aggregate queries / `approved_count` column |
| 14 | Photos saved as `<URN>.jpg` in a public folder (guessable, PII exposed) | `server.js:28`, `:41` | Random names, authorised download |
| 15 | CORS open to every origin | `server.js:32` | Restrict to frontend origin |
| 16 | Broken `window.onerror` script (unterminated string) | `public/admin.html:183` | Not ported |
| 17 | `reset_passes.js` writes legacy status `active`; `sample_students.csv` has malformed DOBs (`2004-`, `2005`) | `reset_passes.js:3`, `sample_students.csv:2-3` | New seed data + import validation |

---

## 12. Implementation phases (task checklists)

Phases follow §6.5 of the synopsis. Each phase ends with something demo-able.

### Phase 1 — Project setup and architecture

- [ ] Install toolchain (§18); create GitHub repo structure (§3); tag `minor-final`.
- [ ] Generate Spring Boot project (Web, Security, Data JPA, Validation, MySQL driver, Flyway, Lombok, Actuator, OAuth2 Resource Server).
- [ ] Create MySQL database + app user; `application-dev.yml` with env-var placeholders.
- [ ] Flyway `V1__init.sql` with the full schema from §7.
- [ ] Global exception handler, `ApiError`/`ProblemDetail`, base entity with timestamps, pagination DTO.
- [ ] springdoc-openapi; `GET /api/v1/health`.
- [ ] Scaffold React + Vite + React Router + React-Bootstrap + Axios; dev proxy to backend.
- [ ] One end-to-end call (React → health endpoint) working.
- [ ] Draw ER diagram, use-case diagram, system architecture diagram (for report).
- **Done when:** both apps start with one command each, schema is created by Flyway, Swagger UI loads.

### Phase 2 — Authentication and user management

- [ ] `User`, `StudentProfile`, `GuestProfile`, `Department` entities + repositories.
- [ ] `SecurityConfig`: stateless, JWT resource server, CORS, public vs protected routes, method security.
- [ ] Login / refresh / logout; BCrypt; lockout after failed attempts; forced password change.
- [ ] Guest sign-up + email verification; forgot/reset password.
- [ ] Admin user CRUD; student CSV/XLSX import with validation report; enrollment toggle; departments CRUD.
- [ ] Profile + photo upload (validated, random filename).
- [ ] Seed admin on first run.
- [ ] Frontend: login, guest sign-up, auth context, protected routes per role, profile page, admin users + import pages.
- [ ] Tests: auth controller tests, role access matrix tests (each role hits each protected route).
- **Done when:** all five roles can log in and only reach their own pages/APIs.

### Phase 3 — Event and registration management

- [ ] `CampusLocation` (minimal for now: name + type) so events can reference a venue.
- [ ] `Event` + eligibility join tables + organizers; lifecycle state machine with guard methods.
- [ ] Eligibility service (fail closed) returning reasons; thorough unit tests.
- [ ] Registration service: open / approval / auto-assign modes, waitlist, atomic capacity, cancel + auto-promote, approve/reject/remove, bulk assign.
- [ ] Notifications stub (in-app) for registration status changes.
- [ ] Frontend: event browse + detail; organizer event wizard; registrations management page; my registrations.
- [ ] Concurrency test: 50 parallel registrations for a 10-seat event → exactly 10 approved, 40 waitlisted.
- **Done when:** parity items P3, P4, P5, P7, P8 work in the new stack, plus approval mode and self-cancel.

### Phase 4 — Digital pass and QR system

- [ ] `Pass` entity; issue on approval, revoke on cancel/reject/event cancel.
- [ ] Token generation + SHA-256 storage; `EQR1:` QR payload.
- [ ] ZXing QR PNG endpoint; OpenPDF ID-card-style pass (photo, details, QR).
- [ ] Scheduled job: expire passes after event end.
- [ ] Revoke / re-issue endpoints.
- [ ] Frontend: My passes (full-screen QR, PDF download), organizer revoke/re-issue buttons.
- **Done when:** parity P6 works and the QR contains no URL or personal data.

### Phase 5 — QR verification and attendance

- [ ] `Gate`, `event_gates`, `security_assignments`; organizer assigns staff.
- [ ] `/scan/verify` with the full check order and atomic claim (§10); `Attendance` + `ScanLog`.
- [ ] Manual scan + attendance override (audited).
- [ ] Scanner pairing via short-lived code QR (parity P11, now secure).
- [ ] SSE live feed per event (parity P12).
- [ ] Frontend: security assignment picker, scanner screen (html5-qrcode, result states, sound/vibrate, manual entry, history); organizer live attendance page.
- [ ] Tests: every result code; two simultaneous scans of the same pass → exactly one `SUCCESS`; scanning from an unassigned gate → 403.
- **Done when:** the full flow "register → approve → pass → scan at gate → attendance appears live on organizer screen" works on a real phone.

> **MVP checkpoint** — Phases 1–5 are the core workflow the synopsis prioritises (§6.7). Get these solid before starting Phase 6.

### Phase 6 — Campus map and venue integration

- [ ] Collect GNDEC campus locations: names, types, coordinates (walk around with phone GPS or read off Google Maps / OpenStreetMap), photos.
- [ ] Extend `CampusLocation` with all fields from §7; gates per location.
- [ ] Seed migration with real campus data.
- [ ] Frontend: full campus map (filters, search, popups with upcoming events), mini-map on event detail, directions link, admin "click to place marker" editor.
- **Done when:** opening any event shows its venue on the map and the map lists events per venue.

### Phase 7 — Analytics, reporting, notifications and audit

- [ ] Analytics repository queries (JPQL / native with `GROUP BY`) for every metric in FR-ANL-1..5.
- [ ] Admin and organizer dashboards with Recharts (bar: department/semester; pie/donut: student vs guest, attendance vs no-show; line: entries over time; table: popularity).
- [ ] Report exports: CSV, XLSX (POI), PDF (OpenPDF).
- [ ] `AuditService` called from all actions in FR-AUD-1; admin audit viewer.
- [ ] Notifications: in-app list + unread badge; email via Spring Mail (Mailtrap in dev, Gmail SMTP app password for demo); 24-hour reminder job.
- **Done when:** a completed demo event shows correct numbers in every chart and exports match the DB.

### Phase 8 — Testing and deployment

- [ ] Complete test plan (§14); fix defects; record results in a test-case table for the report.
- [ ] Load test `/scan/verify` and registration.
- [ ] OWASP ZAP baseline scan; fix findings.
- [ ] Dockerfiles + `docker-compose.yml`; deploy (§15); HTTPS confirmed on phones.
- [ ] Seed demo data; rehearse demo script (§16).
- [ ] Remove `legacy/` once every parity item P1–P15 is ticked.
- **Done when:** deployed URL works end-to-end from phones, tests pass, report chapters are drafted.

---

## 13. Timeline

Week numbers from project start — map them to the department's review / evaluation dates once known.

| Week | Work | Milestone |
|---|---|---|
| 1 | Phase 1 setup, schema, diagrams | Skeleton runs, ER diagram done |
| 2–3 | Phase 2 auth + users | All roles log in |
| 3–5 | Phase 3 events + registration | Registration flow complete |
| 5–6 | Phase 4 passes + QR | Pass + PDF download |
| 6–7 | Phase 5 scanning + attendance | **MVP demo** (good point for a mid-term review) |
| 8–9 | Phase 6 campus map | Map integrated with events |
| 9–11 | Phase 7 analytics, reports, audit, notifications | Dashboards + exports |
| 11–12 | Polish, stretch features if time allows | Feature freeze end of week 12 |
| 12–14 | Phase 8 testing, deployment, report, PPT | Final submission |

Suggested split for a team of 3–4 (adjust to the actual team):
- **Backend core** — security, users, events, registrations
- **QR + scanning** — passes, ZXing/OpenPDF, scan service, SSE, scanner UI
- **Frontend** — layouts, participant + organizer + admin pages
- **Map + analytics + docs** — campus data, map, dashboards, reports, report diagrams

---

## 14. Testing plan

| Type | Tooling | Must cover |
|---|---|---|
| Unit | JUnit 5 + Mockito | Eligibility rules (every combination, fail-closed), lifecycle transitions, waitlist promotion, token generation/hashing, verification check order |
| Repository / integration | `@DataJpaTest` + Testcontainers MySQL | Unique constraints, atomic capacity update, analytics queries |
| API | `@SpringBootTest` + MockMvc | Every endpoint × every role (expected 200/403/401), validation errors, ownership (organizer A can't edit organizer B's event) |
| Concurrency | Parallel threads in tests | 50 registrations for 10 seats; 2–5 simultaneous scans of one pass → exactly one success |
| Frontend | Vitest + React Testing Library | Forms, protected routes, scanner result states |
| End-to-end (stretch) | Playwright | Register → approve → pass → scan |
| Performance | k6 or JMeter | `/scan/verify` at ~50 req/s; p95 < 300 ms |
| Security | OWASP ZAP baseline; manual checks | Items 1–15 in §11 each become a test that must pass |
| Usability | 5–10 classmates on real phones | Time to register; time per gate scan; feedback form |

Keep a test-case table (ID, description, steps, expected, actual, status) — it goes straight into the report.

---

## 15. Deployment plan

- **Camera needs HTTPS.** Browsers only allow camera access on `https://` or `localhost`. Phones on the LAN hitting `http://192.168.x.x` won't be able to scan. Options, in order of preference:
  1. Deploy (below) — real HTTPS.
  2. During development: Vite dev server with HTTPS (`@vitejs/plugin-basic-ssl` or `mkcert`), or a tunnel (Cloudflare Tunnel / ngrok).
- **Recommended hosting** (free/cheap tiers): backend container on Render or Railway; managed MySQL (Railway, Aiven); frontend on Vercel or Netlify. Alternatively one VPS / college server with `docker-compose` + Nginx + Let's Encrypt.
- **Uploads on cloud hosts:** free-tier container disks are wiped on redeploy — use a persistent volume or an object store (e.g. Cloudinary) for photos and banners.
- **Config:** `SPRING_PROFILES_ACTIVE=prod`, DB URL/user/password, `JWT_SECRET`, `MAIL_*`, `FRONTEND_ORIGIN` as env vars.
- **Health:** Spring Actuator `/actuator/health` for the host's health check.
- **Backups:** nightly `mysqldump` (or the provider's backup) before the demo week.

---

## 16. Seed data and migration from the Minor

- The Minor's SQLite data is demo data and its QR passes can't be used in the new token format, so **start fresh**.
- Fix `sample_students.csv` and extend the import format to: `URN, Name, Email, Phone, Department, Semester, Section, Batch, DOB`.
- Dev/demo seed (Flyway `R__dev_seed.sql` or a `CommandLineRunner` active only in `dev` profile):
  - 1 admin, 2 organizers, 3 security staff, ~60 students across 4–5 departments and semesters, 5 guests
  - 15–20 real campus locations with gates
  - 6–8 events covering every registration mode, an outsider-allowed event, a full event with waitlist, a completed event with attendance (so dashboards have data), and a cancelled event
- Optional: one-off script that exports Minor `students` to the new CSV format and imports it through `/admin/students/import`.

**Demo script for the final evaluation:** admin imports students → organizer creates an approval-mode event at a mapped venue → student checks eligibility and registers → organizer approves → student opens pass → security pairs phone, scans at Gate A (green) → same pass again (amber "already used") → pass for another event (red "wrong event") → live attendance updates on organizer screen → analytics + PDF/XLSX report → audit log shows every step.

---

## 17. Report and documentation deliverables

- [ ] SRS (from §4–§6 of this plan)
- [ ] Diagrams: system architecture, ER, use-case (per role), DFD level 0 and 1, class diagram (entities + services), sequence diagrams (registration, pass verification, waitlist promotion), activity diagram (gate entry)
- [ ] Database schema description (from §7)
- [ ] API documentation (Swagger export + summary table from §8)
- [ ] Security design chapter (§10 and the "before/after" table in §11 — strong material for viva)
- [ ] Test-case tables and results (§14), load-test graphs
- [ ] Screenshots of every role's main pages
- [ ] User manual (one page per role)
- [ ] Future scope: Android app on the same API, rotating QR, offline scanning, face match at gate, ERP/LMS integration
- [ ] README with setup steps; final PPT

---

## 18. Environment setup checklist

Each team member:

- [ ] JDK 21 (Temurin) — `java -version`
- [ ] Maven (or use the committed `mvnw`)
- [ ] MySQL Server 8 + MySQL Workbench
- [ ] Node.js LTS + npm
- [ ] IntelliJ IDEA (Community is enough) and/or VS Code with the Java + ESLint extensions
- [ ] Git, GitHub access to the repo
- [ ] Postman or Bruno for API testing
- [ ] Docker Desktop (optional — needed for Testcontainers and compose)
- [ ] A phone with camera for scanner testing

---

## 19. Open questions to settle

1. **Team and deadlines** — team size and the department's review/final dates, to fix the week numbers in §13.
2. **Outsider verification** — is email verification enough, or must guests upload an ID proof that an organizer approves?
3. **Default registration mode** — should most events be `OPEN` (first come) or `APPROVAL`?
4. **Organizer scope** — can any organizer create events, or only for their department/club?
5. **Campus data** — who collects building coordinates and photos, and is a campus layout image available from the college?
6. **Email** — is a college SMTP account available, or use Gmail with an app password for the demo?
7. **Hosting** — college server or cloud free tier? (Affects HTTPS and upload storage.)
8. **Semester vs. year** — confirm that student data from the college uses semester (synopsis analytics are semester-wise; the Minor stored year).
9. **Repository name** — rename `Minor_Project` to `Major_Project` on GitHub, or create a new repo and leave the Minor untouched?
