# Plan — Objectives 1, 2 and 3

**Project:** Smart Campus Event Management and Secure QR Access System (Major Project, GNDEC Ludhiana)
**Scope of this plan:** the first three objectives from `Major_Synopsis.pdf` §3.1, which cover synopsis phases 6.5.1 – 6.5.5.
**Stack (from the synopsis):** Java + Spring Boot + Spring Security + Spring Data JPA/Hibernate + MySQL + Maven, React.js frontend, REST/JSON.

> Objectives 4 (attendance management + campus map) and 5 (dashboards, analytics, reports) come after this. The long-term roadmap for those is in [`qr-pass-app/plan.md`](qr-pass-app/plan.md).
> The clickable UI prototype in [`frontend/`](frontend/README.md) already has the screens; this phase gives them a real backend.

---

## Contents

1. [The three objectives and what "done" means](#1-the-three-objectives-and-what-done-means)
2. [Scope: in and out](#2-scope-in-and-out)
3. [Requirements](#3-requirements)
4. [Architecture and project structure](#4-architecture-and-project-structure)
5. [Database (Flyway V1)](#5-database-flyway-v1)
6. [REST API for this phase](#6-rest-api-for-this-phase)
7. [Security design](#7-security-design)
8. [QR pass and entry verification design](#8-qr-pass-and-entry-verification-design)
9. [Frontend work](#9-frontend-work)
10. [Build order and task checklists](#10-build-order-and-task-checklists)
11. [Timeline](#11-timeline)
12. [Testing](#12-testing)
13. [Evaluation demo script](#13-evaluation-demo-script)
14. [Report material for this phase](#14-report-material-for-this-phase)
15. [Risks](#15-risks)
16. [Decisions needed](#16-decisions-needed)

---

## 1. The three objectives and what "done" means

| # | Objective (synopsis wording) | Synopsis phase | Done when… |
|---|---|---|---|
| **O1** | Develop a centralized Java-based web platform for managing college events, including **event scheduling, venues, capacity, eligibility and participant information**. | 6.5.1, 6.5.3 | An organizer can create, schedule, publish, close, complete and cancel an event at a managed venue, with a capacity and eligibility rules. Students can browse events. Organizers can see and export the participant list. Data is stored in MySQL through the Spring Boot API. |
| **O2** | Implement **secure role-based authentication, registration, and eligibility verification** for administrators, organizers, students and security personnel. | 6.5.2, 6.5.3 | All four roles log in with hashed passwords and JWT. Each API is limited to the right role and owner. Students register for events only if the server confirms they are eligible. Approval and waitlist rules work, and capacity can't be exceeded. |
| **O3** | Develop a **secure digital pass and QR-based access control** system for **event verification, entry management and prevention of unauthorized or repeated access**. | 6.5.4, 6.5.5 | Confirmed participants get a QR pass that holds only an opaque token. Security staff scan it at their assigned gate. The server checks the pass and records one entry. Duplicates, wrong-event, revoked, forged and out-of-time passes are rejected, even when two gates scan at the same moment. |

Implementation order is **O2 auth → O1 events → O2 registration → O3 passes**, because every event and pass API needs a logged-in user and a role.

---

## 2. Scope: in and out

### In scope
- Spring Boot backend and MySQL schema for users, departments, venues, gates, events, eligibility, registrations, passes, entries and scan logs.
- The four roles named in O2: **Admin, Organizer, Student, Security**.
- The React frontend connected to the real API, replacing the prototype's mock store for every screen listed in §9.
- QR generation, a PDF pass, a camera scanner, manual code entry, and the entry record needed to stop a pass being reused.

### Deferred to Objective 4 / 5
| Item | Why it waits |
|---|---|
| Interactive campus map (Leaflet), directions | O4. Venues still get `latitude/longitude` columns now (nullable) so no migration is needed later. |
| Attendance reports, no-show lists, manual attendance override, live attendance dashboard (SSE) | O4 "automated attendance management". O3 only records the entry so the pass can't be reused. |
| Analytics charts, popularity, department- and semester-wise reports, PDF/XLSX reports | O5. O1 still needs a participant list CSV export. |
| Audit log **viewer** | O5. The `audit_logs` table and writes start now, because they're cheap and support "secure". |
| Email notifications, forgot-password by email | Needs SMTP. For now an admin issues a temporary password. |
| Outsider/guest accounts | O2 lists only admin, organizer, student and security. `GUEST` stays in the role enum and the `allow_outsiders` column exists, but guest sign-up is a stretch goal (§16). |

---

## 3. Requirements

IDs are used in tests (§12) and in the report.

### O1 — Event management platform

| ID | Requirement |
|---|---|
| O1-01 | **Departments** master (code, name), managed by admin. Used by students and eligibility rules. |
| O1-02 | **Venues**: admin creates, edits and deactivates venues (name, type, building, floor, capacity, can-host-events flag, optional lat/lng). |
| O1-03 | **Gates**: each venue has one or more named entry gates (e.g. "Gate A (Front)"). |
| O1-04 | **Create/edit event**: title, description, category, venue, start, end, registration open/close, capacity, registration mode (`OPEN`, `APPROVAL`, `AUTO_ASSIGN`), entry gates. |
| O1-05 | **Scheduling validation**: end after start, registration closes before start, start not in the past for new events. |
| O1-06 | **Venue clash check**: publishing is blocked if another published event uses the same venue at an overlapping time. The organizer sees which event clashes. |
| O1-07 | **Capacity**: positive integer. Warn if it's above the venue's capacity. Confirmed seats can never exceed it (enforced in O2-10). |
| O1-08 | **Eligibility rules** per event: departments, semesters, sections. An empty list means no restriction. Rules are saved with the event. |
| O1-09 | **Lifecycle**: `DRAFT → PUBLISHED → CLOSED → COMPLETED`, or `CANCELLED`. Only drafts can be deleted. Cancelling revokes every pass. |
| O1-10 | **Ownership**: an event has one or more organizers. Organizers manage only their own events; admin manages all. |
| O1-11 | **Event discovery**: students see published events with search, category and date filters, pagination, seats left, and an eligibility badge. |
| O1-12 | **Participant information**: organizers see each event's participants (name, URN, department, semester, section, status, registered time, pass status) with filters, search and pagination, and can **export CSV**. |
| O1-13 | **Security assignment**: organizer/admin assigns security staff to the event's gates. This assignment is what allows scanning in O3. |

### O2 — Authentication, roles, registration, eligibility

| ID | Requirement |
|---|---|
| O2-01 | Login: students with **URN**, staff with **email**, plus password. |
| O2-02 | Passwords stored with **BCrypt**. No plaintext anywhere (the Minor stored plaintext). |
| O2-03 | **JWT** access token (15 min) and refresh token (7 days, httpOnly cookie, rotated on use). Logout revokes the refresh token. |
| O2-04 | Roles `ADMIN`, `ORGANIZER`, `STUDENT`, `SECURITY`. Every endpoint has a role rule, and owner checks apply on top. |
| O2-05 | The current user always comes from the token, **never from an ID in the URL** (fixes the Minor's `/api/passes/:urn` leak). |
| O2-06 | Admin creates organizer and security accounts, can deactivate or reactivate any account, and toggles student enrollment. |
| O2-07 | **Bulk student import** from CSV with row-by-row validation (URN format, duplicates, unknown department, semester 1–8). Shows a preview before saving. |
| O2-08 | New and imported accounts get a **temporary password** and must change it at first login. Admin can reset a password to a new temporary one. |
| O2-09 | **Lockout**: 5 failed logins lock the account for 15 minutes. Login is rate-limited per IP. |
| O2-10 | **Registration**: `OPEN` mode confirms instantly up to capacity, then waitlists. `APPROVAL` mode creates a pending request that the organizer approves or rejects (with a reason). `AUTO_ASSIGN` lets the organizer issue passes to all eligible students. One registration per student per event. Capacity holds under concurrent requests. |
| O2-11 | **Self-cancel** before the event starts. Cancelling a confirmed seat promotes the first waitlisted student automatically. |
| O2-12 | **Eligibility verification on the server**: enrolled and active, department, semester and section match, registration window open. The check **fails closed** (the Minor failed open on error). `GET /events/{id}/eligibility` returns a reason for each rule so the UI can explain it. |
| O2-13 | Profile: view details, change password, upload a photo (JPEG/PNG ≤ 2 MB). The photo is shown to security at the gate in O3. |
| O2-14 | Security-relevant actions are written to `audit_logs` (login success/failure, password changes, user and role changes, imports, approvals and rejections, event cancel, pass revoke, manual entry). |

### O3 — Digital pass and QR access control

| ID | Requirement |
|---|---|
| O3-01 | A **pass** is created automatically when a registration becomes confirmed (by the system, approval, promotion or auto-assign). |
| O3-02 | The QR holds only `EQR1:<token>`, where the token is 32 random bytes in Base64URL. Verification looks the pass up by **SHA-256(token)**. The token is never stored in plain text; it's kept AES-GCM encrypted only so the owner can reopen the QR. The QR carries no personal data and no URL. |
| O3-03 | Each pass also has a short **pass code** (`GN-XXXX-XXXX`) for manual entry when the camera can't read the QR. |
| O3-04 | Students see the pass (photo, name, URN, event, date, venue, QR, code) in the app, full-screen, and as a **PDF** generated on the server. |
| O3-05 | Pass states are `ACTIVE`, `USED`, `REVOKED` and `EXPIRED`. The organizer can revoke a pass and re-issue one (new token; the old QR stops working). Passes expire automatically after the event ends. |
| O3-06 | **Scanner** (security role): pick an assigned event and gate, scan with the camera (html5-qrcode) or type a code, and get a full-screen result (green / amber / red) with the holder's photo. |
| O3-07 | **Verification order**: scanner assigned to this event and gate → token or code exists → pass not revoked or expired → registration confirmed → pass belongs to this event → within the entry window (60 min before start until end) → holder active and enrolled → not already used. Each failure has its own result code. |
| O3-08 | **No repeated entry**: the first valid scan claims the pass atomically (`UPDATE … WHERE status='ACTIVE'`). A unique constraint on the entry table is the second safety net. Two gates scanning the same pass at once give exactly one success. |
| O3-09 | **Entry record**: event, gate, time, scanned-by, method (QR or manual). This is the minimum O3 needs; O4 builds attendance reports on it. |
| O3-10 | **Scan log**: every attempt, successful or not, with its result code, for investigation. |
| O3-11 | The scan endpoint is rate-limited per user. Manual-code entries go to the audit log. |
| O3-12 | Works on phones over **HTTPS** (browsers only allow the camera on HTTPS or localhost). |

### Non-functional (all three)

- Layered backend: controller → service → repository. DTOs only; entities are never returned.
- Validation with Jakarta Bean Validation. One error format (`ProblemDetail`) through `@RestControllerAdvice`.
- Every list endpoint is paginated.
- Times stored in UTC and shown in IST.
- CORS allows only the frontend origin. Secrets come from environment variables.
- Swagger UI (springdoc) documents every endpoint. It doubles as API documentation for the report.
- Scan verification responds in under 300 ms on campus Wi-Fi.

---

## 4. Architecture and project structure

```
React (Vite, React-Bootstrap)  ──REST/JSON + JWT──▶  Spring Boot  ──JPA/Hibernate──▶  MySQL 8
     frontend/                                       backend/                          (Flyway)
```

```
Minor_Project/
├── backend/                         NEW — Spring Boot (Maven, Java 21)
│   └── src/main/java/in/gndec/events/
│       ├── config/        SecurityConfig, JwtConfig, CorsConfig, OpenApiConfig
│       ├── common/        ApiError handler, PageResponse, BaseEntity, AuditService
│       ├── auth/          AuthController, TokenService, RefreshToken, LoginAttemptService
│       ├── user/          User, StudentProfile, Department, UserService, StudentImportService
│       ├── venue/         Venue, Gate
│       ├── event/         Event, EligibilityRules, EventService, EligibilityService
│       ├── registration/  Registration, RegistrationService (capacity, waitlist, approval)
│       ├── pass/          Pass, PassService, QrService (ZXing), PassPdfService (OpenPDF)
│       └── scan/          ScanService, Entry, ScanLog, SecurityAssignment
│   └── src/main/resources/db/migration/   V1__schema.sql, V2__seed_dev.sql
├── frontend/                        EXISTS — prototype; switch from mock store to API (§9)
├── qr-pass-app/                     Minor project (reference only) + long-term plan.md
└── plan.md                          this file
```

Main dependencies: `spring-boot-starter-web`, `-security`, `-oauth2-resource-server` (JWT), `-data-jpa`, `-validation`, `-actuator`, `mysql-connector-j`, `flyway-core` + `flyway-mysql`, `springdoc-openapi-starter-webmvc-ui`, `lombok`, `com.google.zxing:core` + `javase`, `com.github.librepdf:openpdf`, `bucket4j` (rate limits), tests: `spring-boot-starter-test`, `spring-security-test`, `testcontainers` (mysql).

---

## 5. Database (Flyway V1)

Every table has `id BIGINT AUTO_INCREMENT PRIMARY KEY`, `created_at` and `updated_at` unless noted.

| Table | Columns | Key constraints | Objective |
|---|---|---|---|
| `departments` | code, name | `UNIQUE(code)` | O1 |
| `users` | role, full_name, email, phone, password_hash, status (`ACTIVE`/`INACTIVE`/`LOCKED`), must_change_password, failed_logins, locked_until, photo_path, last_login_at | `UNIQUE(email)` | O2 |
| `student_profiles` | user_id, urn, department_id, semester, section, batch, dob, enrolled | `UNIQUE(urn)`, `UNIQUE(user_id)` | O2 |
| `refresh_tokens` | user_id, token_hash, expires_at, revoked_at | `UNIQUE(token_hash)` | O2 |
| `venues` | name, type, building, floor, capacity, can_host_events, active, latitude NULL, longitude NULL | | O1 |
| `gates` | venue_id, name | `UNIQUE(venue_id, name)` | O1 |
| `events` | title, description, category, venue_id, starts_at, ends_at, reg_opens_at, reg_closes_at, capacity, **confirmed_count**, mode, allow_outsiders, status, cancel_reason, created_by | `CHECK(ends_at > starts_at)`, `CHECK(confirmed_count <= capacity)`, index `(venue_id, starts_at)` | O1 |
| `event_organizers` | event_id, user_id | PK `(event_id, user_id)` | O1 |
| `event_eligible_departments` / `_semesters` / `_sections` | event_id, value | PK `(event_id, value)` | O1/O2 |
| `event_gates` | event_id, gate_id | PK `(event_id, gate_id)` | O1/O3 |
| `security_assignments` | event_id, gate_id, user_id | `UNIQUE(event_id, gate_id, user_id)` | O1/O3 |
| `registrations` | event_id, user_id, status (`PENDING`/`CONFIRMED`/`WAITLISTED`/`REJECTED`/`CANCELLED`), note, reason, registered_at, decided_at, decided_by | **`UNIQUE(event_id, user_id)`**, index `(event_id, status, registered_at)` | O2 |
| `passes` | registration_id, event_id, user_id, token_hash, token_enc, code, status, issued_at, used_at, revoked_at, revoked_reason | **`UNIQUE(token_hash)`**, `UNIQUE(code)`, index `(registration_id, status)` | O3 |
| `entries` | registration_id, pass_id, event_id, gate_id, scanned_by, method, entered_at | **`UNIQUE(registration_id)`** — one entry per registration | O3 |
| `scan_logs` | event_id, gate_id, pass_id NULL, scanned_by, result, method, device_id, scanned_at | index `(event_id, scanned_at)` | O3 |
| `audit_logs` | actor_id NULL, action, entity_type, entity_id, details, ip, created_at | index `(created_at)` | O2/O3 |

`entries` is named for O3's "entry management". In O4 it becomes the source for attendance reports, so no rename is needed.

`V2__seed_dev.sql` (dev profile only) loads the same demo data as the prototype: 7 departments, 4 roles' demo accounts, about 120 students, the campus venues and gates, and about 8 events in every state.

---

## 6. REST API for this phase

Base path `/api/v1`. 🔓 = public; otherwise a JWT is required. Roles: A = admin, O = organizer (owner), S = student, Sec = security.

**Auth & profile (O2)**
| Method | Path | Who |
|---|---|---|
| POST | `/auth/login` · `/auth/refresh` · `/auth/logout` | 🔓 |
| GET / PUT | `/me` | all |
| PUT | `/me/password` | all |
| POST | `/me/photo` | all |

**Admin: users, departments, venues (O1/O2)**
| Method | Path | Who |
|---|---|---|
| GET / POST | `/admin/users` (filter by role, status, dept, semester; paginated) | A |
| PATCH | `/admin/users/{id}` · `/admin/users/{id}/status` · `/admin/users/{id}/enrollment` | A |
| POST | `/admin/users/{id}/reset-password` → returns temp password once | A |
| POST | `/admin/students/import/preview` · `/admin/students/import` (CSV) | A |
| CRUD | `/admin/departments` | A |
| CRUD | `/admin/venues`, `/admin/venues/{id}/gates` | A |
| GET | `/venues` (event-capable venues with gates) | A, O |

**Events (O1)**
| Method | Path | Who |
|---|---|---|
| GET | `/events` (published; filters; eligibility flag for students) | all |
| GET | `/events/{id}` | all (drafts: owner/admin) |
| GET | `/events/{id}/eligibility` → `{eligible, reasons[]}` | S |
| GET | `/manage/events` (mine; admin sees all) | A, O |
| POST / PUT / DELETE | `/manage/events[/{id}]` (delete = draft only) | A, O |
| POST | `/manage/events/{id}/publish` · `/close` · `/reopen` · `/complete` · `/cancel` | A, O |
| PUT | `/manage/events/{id}/gates/{gateId}/staff` (security assignment) | A, O |
| GET | `/manage/events/{id}/participants` (filters, paginated) · `/participants.csv` | A, O |

**Registrations (O2)**
| Method | Path | Who |
|---|---|---|
| POST | `/events/{id}/registrations` (optional note) | S |
| GET | `/me/registrations` | S |
| POST | `/me/registrations/{id}/cancel` | S |
| POST | `/manage/registrations/approve` · `/reject` (bulk, with reason) | A, O |
| POST | `/manage/registrations/{id}/promote` · `/remove` | A, O |
| POST | `/manage/events/{id}/bulk-assign` (all eligible or a list of URNs) | A, O |

**Passes & scanning (O3)**
| Method | Path | Who |
|---|---|---|
| GET | `/me/passes` | S |
| GET | `/passes/{id}/qr.png` · `/passes/{id}/pdf` | owner, A, O |
| POST | `/manage/passes/{id}/revoke` · `/manage/registrations/{id}/reissue-pass` | A, O |
| GET | `/scan/assignments` (my event + gate options) | Sec, O, A |
| POST | `/scan/verify` `{eventId, gateId, qr \| code \| urn, deviceId}` → result | Sec, O, A |
| GET | `/scan/history` | Sec (own), O, A |

The prototype's `frontend/src/store/actions.js` has one function per row above with the same rules. Use it as the reference when writing each service.

---

## 7. Security design

| Concern | Decision |
|---|---|
| Password storage | BCrypt (strength 10) |
| Tokens | Spring Security resource server with an HMAC-SHA256 JWT secret from `JWT_SECRET`. Claims: `sub` (user id), `role`. Access 15 min. Refresh 7 days, stored hashed, rotated, httpOnly + `SameSite=Strict` cookie. |
| Authorization | `@PreAuthorize` on service methods plus ownership checks (`eventSecurity.isOrganizer(eventId)`). Security staff can scan only at `security_assignments` rows that belong to them. |
| IDOR | No endpoint takes "my" user ID as a parameter; `/me/*` reads it from the token. |
| Brute force | Lockout after 5 failures. Bucket4j limits: login 10/min/IP, scan 120/min/user. |
| Input | Bean Validation on every DTO. Uploads: type check by magic bytes, ≤ 2 MB, random file names, served only to signed-in users. |
| XSS | React escapes output, and `dangerouslySetInnerHTML` is never used. |
| CORS | Allows only `FRONTEND_ORIGIN`. |
| Transport | HTTPS in the demo deployment (also needed for the camera). |
| Audit | `AuditService.log(action, entity, id, details)` is called from the services listed in O2-14. |

---

## 8. QR pass and entry verification design

**Issuing (O3-01 … O3-03)**
```
confirm registration ─▶ token = Base64URL(SecureRandom 32 bytes)
                       code  = "GN-" + 4 + "-" + 4 chars (no 0/O/1/I)
                       INSERT passes(token_hash = SHA-256(token),
                                     token_enc  = AES-GCM(token, PASS_KEY),
                                     code, status = ACTIVE)
```
The QR image and PDF are generated on request: the server decrypts `token_enc` (owner, organizer or admin only) and draws `EQR1:<token>`. Verification never decrypts anything; it hashes the scanned token and looks up `token_hash`. A database leak alone therefore can't produce working QR codes without `PASS_KEY`, which lives in an environment variable.

**Verifying (O3-07, O3-08)** — `ScanService.verify()` runs in one `@Transactional` method:
```
1  assignment(eventId, gateId, currentUser) exists?        else NOT_ASSIGNED
2  parse "EQR1:" → find by SHA-256, or find by code / URN  else INVALID_TOKEN / INVALID_FORMAT
3  pass.status REVOKED / EXPIRED?                          → REVOKED / EXPIRED
4  registration.status == CONFIRMED?                       else NOT_APPROVED
5  pass.eventId == eventId?                                else WRONG_EVENT (+ which event)
6  now within [start − 60 min, end]?                       else OUTSIDE_WINDOW
7  holder active and enrolled?                             else ACCOUNT_INACTIVE
8  UPDATE passes SET status='USED', used_at=now()
     WHERE id=? AND status='ACTIVE'      -- 0 rows → ALREADY_USED (+ first entry time/gate)
9  INSERT entries(...)                    -- UNIQUE(registration_id) is the backstop
10 INSERT scan_logs(result)  (every path above logs before returning)
→  { result, message, holder{name, urn, dept/sem, photoUrl}, enteredAt }
```

**Capacity under load (O2-10):**
```sql
UPDATE events SET confirmed_count = confirmed_count + 1
 WHERE id = ? AND confirmed_count < capacity;   -- 1 row = seat confirmed, 0 rows = waitlist
```
Cancel or remove decrements the count, then promotes the oldest waitlisted registration in the same transaction.

---

## 9. Frontend work

The prototype already has every screen. The work is to replace the mock store with API calls and hide screens that belong to later objectives.

| Task | Detail |
|---|---|
| API client | `src/api/client.js`: Axios with `baseURL`, access token in memory, and a 401 interceptor that calls `/auth/refresh` once and retries. |
| Data hooks | One module per area (`authApi`, `eventsApi`, `registrationsApi`, `passesApi`, `scanApi`, `adminApi`) using TanStack Query. Replace `useStore` and `actions.js` page by page. |
| Session | Replace `store/session.js` with an `AuthContext` that holds the user from `/me`. |
| Remove mock-only parts | Demo tools panel, quick sign-in buttons, stale-data banner, simulation buttons (keep them behind `import.meta.env.DEV` if useful for testing). |
| Hide until O4/O5 | Campus map page, Live attendance tab, Analytics tab and page, Reports page, Audit log page, guest sign-up, notifications (unless the stretch goal is done). |

Screens wired in this phase:

| Role | Screens | Objective |
|---|---|---|
| All | Login, forced/normal change password, profile + photo | O2 |
| Student | Home, Browse events, Event detail (eligibility reasons, register/cancel), My registrations, My passes (full-screen QR, PDF) | O1, O2, O3 |
| Organizer | My events, Event wizard (venue clash and capacity warnings), Event manage → Overview, Registrations (approve/reject/promote/remove/bulk assign/CSV), Gates & security | O1, O2 |
| Security | Duty list, Scanner (camera + manual), Scan history | O3 |
| Admin | Users (create, deactivate, enrollment, reset password), Student import, Departments, Venues & gates (form + table; the map editor waits for O4), All events | O1, O2 |

---

## 10. Build order and task checklists

### Step 0 — Setup (synopsis 6.5.1)
- [ ] Install JDK 21, Maven, MySQL 8 + Workbench, Node LTS, IntelliJ/VS Code.
- [ ] `git tag minor-final` on the current commit. Commit the `frontend/` prototype and this plan.
- [ ] Generate `backend/` from start.spring.io with the dependencies in §4. Commit `mvnw`.
- [ ] `application.yml` + `application-dev.yml` reading `DB_URL`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET`, `PASS_KEY`, `FRONTEND_ORIGIN`.
- [ ] Flyway `V1__schema.sql` (§5) and `V2__seed_dev.sql`. `ddl-auto=validate`.
- [ ] `ApiError`/`ProblemDetail` handler, `PageResponse`, `BaseEntity`, Swagger UI, `/actuator/health`.
- [ ] Vite dev proxy `/api → http://localhost:8080`.
- [ ] Diagrams for the report: architecture, ER (this phase's tables), use case (4 roles).
- **Check:** `./mvnw spring-boot:run` starts, Flyway creates every table, Swagger loads, and the React app calls `/api/v1/health`.

### Step 1 — Authentication & users (O2-01 … O2-09, O2-13, O2-14)
- [ ] Entities and repositories: `User`, `StudentProfile`, `Department`, `RefreshToken`, `AuditLog`.
- [ ] `SecurityConfig`: stateless, JWT resource server, public routes, CORS, method security.
- [ ] `AuthController`: login (URN or email), refresh, logout. `LoginAttemptService` handles lockout. Bucket4j filter on login.
- [ ] `/me`, change password, forced change (`must_change_password` blocks every other API with 403 `PASSWORD_CHANGE_REQUIRED`), photo upload.
- [ ] Admin user CRUD, status, enrollment, reset password, departments CRUD.
- [ ] CSV import: preview endpoint returns per-row errors; import endpoint saves valid rows with temp passwords.
- [ ] Frontend: AuthContext, Axios client, login, change password, profile, admin Users, Import, Departments.
- [ ] Tests: T-AUTH-*, T-RBAC-* (§12).
- **Check:** each of the four roles signs in and only its own screens and APIs work. Five wrong passwords lock the account.

### Step 2 — Venues & events (O1-01 … O1-13)
- [ ] `Venue`, `Gate` CRUD (admin).
- [ ] `Event` + eligibility join tables + organizers + gates. `EventService` with validation (O1-05), venue clash (O1-06), lifecycle guards (O1-09), ownership (O1-10).
- [ ] Security assignments per gate.
- [ ] Public event list and detail with filters and pagination. Draft visibility limited to owner/admin.
- [ ] Participant list endpoint and CSV export.
- [ ] Frontend: Browse events, Event detail, My events, Event wizard, Event manage → Overview and Gates & security, admin Venues & gates.
- [ ] Tests: T-EVT-* (§12).
- **Check:** an organizer creates an event, gets blocked by a venue clash, fixes it, publishes, assigns gate staff, and students can see it.

### Step 3 — Registration & eligibility (O2-10 … O2-12)
- [ ] `EligibilityService` (fails closed, returns reasons) and the `/events/{id}/eligibility` endpoint.
- [ ] `RegistrationService`: register by mode, atomic capacity, waitlist, approve/reject (bulk), promote, remove, self-cancel with auto-promotion, bulk assign.
- [ ] Pass creation hook on every path that confirms a registration (calls `PassService.issue`, built in Step 4; stub it first).
- [ ] Frontend: register / request / join waitlist / cancel on Event detail, My registrations, organizer Registrations tab (approve, reject, promote, remove, bulk assign, CSV).
- [ ] Tests: T-REG-*, including the 50-thread capacity test.
- **Check:** an approval event shows pending → approved. A full open event waitlists the next student, and cancelling one seat promotes them automatically.

### Step 4 — Passes & QR (O3-01 … O3-05)
- [ ] `PassService.issue/revoke/reissue/expire`. Token, hash and code generation. Scheduled job expires passes after events end.
- [ ] `QrService` (ZXing PNG) and `PassPdfService` (OpenPDF ID-card layout with photo, details and QR).
- [ ] `/me/passes`, `qr.png`, `pdf`, revoke and reissue endpoints.
- [ ] Frontend: My passes (card, full-screen QR, PDF download), organizer revoke/reissue in the Registrations tab.
- [ ] Tests: T-PASS-*.
- **Check:** the QR decodes to `EQR1:…` only. After a reissue, the old QR fails with `INVALID_TOKEN`.

### Step 5 — Scanning & entry control (O3-06 … O3-12)
- [ ] `ScanService.verify` exactly as in §8. Writes `Entry` and `ScanLog`. Audit log for manual entries. Rate limit.
- [ ] `/scan/assignments`, `/scan/verify`, `/scan/history`.
- [ ] Frontend: security Duty list, Scanner (camera via html5-qrcode, manual code/URN entry, result overlay with photo, sound and vibration), Scan history.
- [ ] HTTPS for phone testing (Vite `basicSsl` plugin, or a Cloudflare tunnel).
- [ ] Tests: T-SCAN-*, including the concurrent duplicate-scan test.
- **Check:** on two real phones at two gates, the same pass gives exactly one green and one amber "already checked in".

### Step 6 — Hardening & evaluation prep
- [ ] Run every test in §12 and record the results in the test-case table.
- [ ] OWASP ZAP baseline scan against the dev deployment. Fix anything high or medium.
- [ ] Load test `/scan/verify` (k6 or JMeter, 50 requests/s).
- [ ] Deploy over HTTPS (or run locally with HTTPS) for the demo. Rehearse §13.
- [ ] Report chapters and screenshots (§14).

---

## 11. Timeline

Eight weeks. Shift the weeks to fit the department's review dates (§16).

| Week | Work | Milestone |
|---|---|---|
| 1 | Step 0 | Backend skeleton + schema running |
| 2–3 | Step 1 | **O2 auth done**: all roles log in |
| 3–4 | Step 2 | **O1 done**: events, venues, eligibility rules, participant list |
| 5 | Step 3 | **O2 done**: registration, approval, waitlist, eligibility verification |
| 6 | Step 4 | Passes, QR, PDF |
| 7 | Step 5 | **O3 done**: scanning with duplicate prevention on real phones |
| 8 | Step 6 | Tests, deployment, demo rehearsal, report |

Suggested split for a team of 3–4:
- **Backend A:** auth, users, import, security config.
- **Backend B:** events, registrations, passes, scanning.
- **Frontend:** API client, wiring screens, scanner.
- **QA and report:** tests, diagrams, documentation. Everyone takes part in the concurrency tests and the demo.

---

## 12. Testing

| ID | Test | Objective |
|---|---|---|
| T-AUTH-01 | Correct URN/email + password → 200 with tokens. Wrong password → 401 with remaining attempts. | O2 |
| T-AUTH-02 | 5 failures → `LOCKED`, and login is refused for 15 minutes even with the right password | O2 |
| T-AUTH-03 | `must_change_password` user gets 403 on every API except `/me/password` | O2 |
| T-AUTH-04 | Expired access token → 401. Refresh works once; reusing the same refresh token → 401. | O2 |
| T-AUTH-05 | Passwords in DB are BCrypt hashes (`$2a$…`) | O2 |
| T-RBAC-01 | Matrix test: every protected endpoint × 4 roles + anonymous → expected 200/401/403 | O2 |
| T-RBAC-02 | Organizer A editing, approving or exporting organizer B's event → 403 | O2 |
| T-RBAC-03 | Student fetching another student's pass by ID → 403 | O2 |
| T-EVT-01 | End before start, or registration closing after start → 400 with field errors | O1 |
| T-EVT-02 | Publishing an event that overlaps another at the same venue → 409 naming the clash | O1 |
| T-EVT-03 | Lifecycle: delete published → 409; cancel → every pass `REVOKED`; complete → active passes `EXPIRED` | O1 |
| T-EVT-04 | Student list hides drafts. Pagination and filters return correct counts. | O1 |
| T-EVT-05 | Participant CSV has one row per registration with the right columns | O1 |
| T-ELIG-01 | Each rule (department, semester, section, enrolled, window) fails on its own with the right reason | O2 |
| T-ELIG-02 | Missing or corrupt rules → not eligible (fails closed) | O2 |
| T-REG-01 | Open mode: confirmed until full, then waitlisted | O2 |
| T-REG-02 | **50 parallel registrations for 10 seats → exactly 10 confirmed, 40 waitlisted** | O2 |
| T-REG-03 | Second registration for the same event → 409 | O2 |
| T-REG-04 | Cancel a confirmed seat → first waitlisted promoted and gets a pass | O2 |
| T-REG-05 | Approve when full → refused. Reject requires a reason. | O2 |
| T-PASS-01 | QR content matches `^EQR1:[A-Za-z0-9_-]{43}$`. The DB holds only the hash and the encrypted token; the plain token appears nowhere in the DB. | O3 |
| T-PASS-02 | Reissue → old token gives `INVALID_TOKEN`, new one works | O3 |
| T-PASS-03 | PDF downloads for the owner; another student gets 403 | O3 |
| T-SCAN-01 … 10 | One test per result code in §8 (SUCCESS, ALREADY_USED, WRONG_EVENT, REVOKED, EXPIRED, NOT_APPROVED, OUTSIDE_WINDOW, ACCOUNT_INACTIVE, INVALID_TOKEN, NOT_ASSIGNED) | O3 |
| T-SCAN-11 | **5 parallel scans of one pass → exactly 1 SUCCESS, 4 ALREADY_USED, 1 row in `entries`** | O3 |
| T-SCAN-12 | Every attempt creates a `scan_logs` row; manual code entry also creates an audit row | O3 |
| T-SCAN-13 | `/scan/verify` p95 < 300 ms at 50 req/s | O3 |
| T-UI-01 | Main flows work at 375 px width (login, register, show pass, scanner) | all |

Tooling: JUnit 5 + Mockito for services, MockMvc + `spring-security-test` for API and role tests, Testcontainers MySQL for repository and concurrency tests, Vitest + React Testing Library for key components.

---

## 13. Evaluation demo script

About 10 minutes, with three browser windows (admin/organizer on a laptop, a student phone, a security phone):

1. **Admin** imports a CSV of students. The preview shows two bad rows; import the rest.
2. **Admin** creates a security account. The temp password forces a change at first login. **(O2)**
3. **Organizer** creates "Tech Talk" in the Seminar Hall at the same time as an existing event. The venue clash is blocked; change the time and publish. Set eligibility to CSE/IT, Sem 5 & 7, capacity 3, approval mode. Assign security to the Main Door. **(O1)**
4. An **ME student** opens it and sees "not eligible", with the reasons. A **CSE Sem 7 student** requests a seat. **(O2)**
5. **Organizer** approves. The student's pass appears; show the full-screen QR and the PDF. **(O3)**
6. **Security** scans: green with the photo. Scan again: amber "already checked in at 10:42, Main Door". Scan a pass for another event: red "wrong event". Type a pass code manually. **(O3)**
7. **Organizer** revokes a pass. Scanning it now shows red "revoked". **(O3)**
8. Show the **participant list CSV** and the `audit_logs` table in MySQL Workbench. Show the passwords stored as BCrypt hashes. **(O1, O2)**
9. Show the **concurrency test** output (T-REG-02, T-SCAN-11) and Swagger UI.

---

## 14. Report material for this phase

- [ ] Problem statement and objectives 1–3 with how each was met (§1 table).
- [ ] SRS for the four roles (§3).
- [ ] Diagrams: architecture, ER (§5 tables), use case, sequence diagrams for login + refresh, registration with capacity, and pass verification. Activity diagram for gate entry. State diagrams for event, registration and pass.
- [ ] API table (§6) plus Swagger screenshots.
- [ ] Security design (§7, §8). Include a before/after against the Minor project: plaintext passwords, open admin APIs, the public `/verify` URL that recorded attendance, and duplicate-scan races.
- [ ] Test-case table with actual results (§12) and load-test numbers.
- [ ] Screenshots of every screen in §9 on desktop and phone.

---

## 15. Risks

| Risk | Mitigation |
|---|---|
| Camera doesn't open on phones | Use HTTPS (Vite `basicSsl` or a tunnel) from Step 5 day one. Manual code entry is always available. |
| JWT/refresh setup takes longer than planned | Use the built-in resource-server support (no custom filter). Timebox it to 3 days; if it overruns, use an access token only and add refresh later. |
| Concurrency bugs only show under load | The two concurrency tests are required in CI, not optional. |
| Frontend and backend drift | Keep DTO field names identical to the prototype's mock data, and generate an API client from the OpenAPI spec if possible. |
| College Wi-Fi blocks the demo deployment | Have a local laptop setup with mobile hotspot as backup. |
| Scope creep into O4/O5 | Anything in §2 "Deferred" goes to a backlog file, not into this phase. |

---

## 16. Decisions needed

1. **Review date**: when is the evaluation for objectives 1–3? This fixes the week numbers in §11.
2. **Team**: how many members, and who takes which track in §11?
3. **Guests**: keep outsider registration out of this phase, as O2's wording suggests, or add guest sign-up as a stretch?
4. **Email**: is a college SMTP account available? If yes, forgot-password by email moves into Step 1; if not, admin reset stays.
5. **Demo hosting**: a college server, a cloud free tier, or a local laptop with HTTPS?
