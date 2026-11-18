# Testing

Results recorded on 18 Nov 2026 on a Windows 11 laptop (JDK 25 running the Java 21 build).

## Automated tests

| Suite | Command | Result |
|---|---|---|
| Backend on H2 (MySQL mode) | `cd backend && ./mvnw test` | 49 passed |
| Backend on PostgreSQL 17 (the Supabase setup) | `cd backend && ./mvnw test -Ddb=postgres` | 49 passed |
| Frontend | `cd frontend && npm test` | 10 passed |

| Test class | Tests | Covers |
|---|---|---|
| `AuthTests` | 5 | T-AUTH-01 … 05: sign-in, lockout, forced password change, refresh-token rotation and reuse, BCrypt |
| `AccessControlTests` | 3 | T-RBAC-01 … 03: role matrix, organizers limited to their own events, passes limited to their owner |
| `EventManagementTests` | 6 | T-EVT-01 … 05: schedule validation, venue clash, lifecycle, drafts hidden, participant CSV; admins editing events they organise |
| `RegistrationTests` | 8 | T-ELIG, T-REG-01 … 05 including **50 parallel registrations for 10 seats → exactly 10 confirmed** |
| `ScanTests` | 10 | T-PASS-01 … 03, T-SCAN-01 … 12 including **5 parallel scans of one pass → exactly 1 success** |
| `AttendanceTests` | 5 | Objective 4: attendance from entries (gates, departments, semesters, timeline), mark present / absent with a reason, gates-open rule, access control, live feed over Server-Sent Events |
| `AnalyticsReportTests` | 4 | Objective 5: dashboard figures and definitions, organizer scope and date ranges, reports in CSV / Excel / PDF (contents read back), summary report sheets, audit of exports |
| `CampusAuditTests` | 3 | Campus map places and their upcoming events, loading the GNDEC campus twice without duplicates, audit-log search, filters, export and access |
| `DeploymentTests` | 5 | Site and API on one URL, allowed origins, photos stored in the database, first administrator, browser security headers |
| Frontend `client.test.js` | 5 | Query strings, refresh-and-retry on 401, error details, the live-feed stream parser (events split across chunks, heartbeats, Windows line endings), stopping on 403 |
| Frontend `events.test.js` | 5 | Event phase, eligibility summary, percentages, audit labels, report date ranges |

## Gate scanner load test (T-SCAN-13)

Target from the plan: `POST /scan/verify` answers 95% of requests within 300 ms at 50 requests per second.

```bash
java -XX:MaxRAM=512m -jar backend/target/smart-campus-events-0.0.1-SNAPSHOT.jar --spring.profiles.active=h2 --server.port=8092 --app.scan-rate-per-minute=100000
node tools/loadtest/scan-load.mjs http://localhost:8092 50 60
```

The server was limited to 512 MB, the same as Render's free plan. Requests were sent at a fixed rate whatever the response time, mixing URNs of confirmed participants (the first scan admits them, later ones are "already used") with random QR tokens (refused). Every request runs the full check and writes a scan-log row.

| Rate | Duration | Requests | Errors | p50 | p95 | p99 | Max |
|---|---|---|---|---|---|---|---|
| **50 / s** | 60 s | 3,000 | 0 | 7.4 ms | **18.1 ms** | 26.2 ms | 96 ms |
| 200 / s | 30 s | 6,000 | 0 | 4.5 ms | 8.4 ms | 200 ms | 455 ms |

The target is met with a wide margin. At four times the target rate the slowest 1% of requests reached 0.2–0.5 s, caused by garbage-collection pauses in the 512 MB limit.

The live site's free instance has a tenth of a CPU, so expect it to be roughly ten times slower than these figures; a paid instance for event days is recommended in [DEPLOY.md](../DEPLOY.md). The load test must never be run against the live site, because every request is a real scan.

## Security checks

- **Browser security headers.** Content-Security-Policy, Referrer-Policy, Permissions-Policy, X-Content-Type-Options, X-Frame-Options and (over HTTPS) HSTS are tested in `DeploymentTests`. The production build was clicked through with the policy active (sign-in, campus map tiles, charts, live attendance feed, scanner page) with no content blocked.
- **OWASP ZAP baseline scan.** Not run: ZAP isn't installed on the development laptop. Run it against the live site with `docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t https://<your-service>.onrender.com` and record the findings here.

## Not yet tested

- **The MySQL profile against a real MySQL server.** The same migrations run on H2 in MySQL mode in every test, but not on MySQL itself. Create the database with `backend/db/create-database.sql` and start the backend once to confirm.
