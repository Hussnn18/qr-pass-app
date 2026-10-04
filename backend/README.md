# Backend — Spring Boot API

REST API under `/api/v1`. Interactive docs: http://localhost:8080/swagger-ui.html while it runs.

## Profiles

| Profile | Database | Secrets | Demo data |
|---|---|---|---|
| `dev` (default) | MySQL `smart_campus_events` | built-in dev values | loaded when the users table is empty |
| `h2` | in-memory H2 (MySQL mode), wiped on restart | built-in dev values | loaded on every start |
| `prod` | from env | **must** come from env | off |

The database setup script is [db/create-database.sql](db/create-database.sql). Flyway migrations live in `src/main/resources/db/migration`.

## Environment variables

| Variable | Default (dev) | Purpose |
|---|---|---|
| `DB_URL` / `DB_USER` / `DB_PASSWORD` | `jdbc:mysql://localhost:3306/smart_campus_events` / `scems_app` / `scems_local_dev` | MySQL connection |
| `JWT_SECRET` | dev-only value | HS256 signing key, at least 32 bytes |
| `PASS_KEY` | dev-only value | base64 of 32 random bytes; AES-256-GCM key for stored pass tokens |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | CORS origin |
| `COOKIE_SECURE` | `false` | set `true` behind HTTPS |
| `UPLOAD_DIR` | `uploads` | profile photos |
| `SEED_DEMO_DATA` | `true` | load demo data in dev |
| `PORT` | `8080` | HTTP port |

Generate production secrets with `openssl rand -base64 48` (JWT) and `openssl rand -base64 32` (pass key). Keep `PASS_KEY` fixed once passes exist: the app decrypts stored tokens to draw the QR code, PNG and PDF, so a new key stops existing passes from displaying (gate checks still work because they compare hashes).

## Build and run

```bash
./mvnw test                     # 31 integration tests on H2
./mvnw package                  # target/smart-campus-events-0.0.1-SNAPSHOT.jar
java -jar target/smart-campus-events-0.0.1-SNAPSHOT.jar --spring.profiles.active=h2
```

## Code layout (`in.gndec.events`)

| Package | Contents |
|---|---|
| `config` | security (JWT resource server, role rules, forced password change), OpenAPI, scheduling |
| `common` | errors (`ApiException` → RFC 7807 with a `code`), audit log, rate limiter, paging, CSV |
| `auth` | login, refresh-token rotation with reuse detection, logout |
| `user` | users, student profiles, departments, admin user management, bulk import, photos |
| `venue` | venues and gates |
| `event` | events, eligibility, organizer management, admin summary |
| `registration` | register, cancel, approve/reject, waitlist promotion (event row lock + conditional seat claim) |
| `pass` | pass issue/reissue, QR PNG, PDF |
| `scan` | security assignments, gate verification, entries, scan log |
| `seed` | demo data for `dev` / `h2` |
