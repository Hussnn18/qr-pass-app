# Objectives 4 and 5 — what was built

Objectives 1–3 are planned in [plan.md](../plan.md). This document covers the second half of the synopsis:

| # | Objective (synopsis wording) | Done when… |
|---|---|---|
| **O4** | To implement **automated attendance management** along with an **interactive campus map** that guides participants to event venues. | Attendance for every event is built from the gate entries without extra work: who is present, who is absent, through which gate and when, live while the event runs. Organizers can correct it with a reason. Every venue is on a campus map with its upcoming events and walking directions. |
| **O5** | To provide **dashboards, analytics and reports** that help the administration monitor events and participation. | Admins (all events) and organizers (their own) see participation by department, semester and category, event popularity, trends and gate usage for any date range, and can download the numbers as Excel, PDF or CSV. Admins can search the audit log. |

## Requirements

### O4 — Attendance management and campus map

| ID | Requirement | Where |
|---|---|---|
| O4-01 | **Attendance from entries.** For each event: confirmed, present, absent (called *no-shows* once the event has ended), attendance rate, entries in the last hour, refused scans. | `AttendanceService.summary`, Attendance tab |
| O4-02 | **Breakdowns.** Entries per gate (with the staff on duty and the latest entry), entries over time in 15-minute slots (wider for long events, at most 96 slots), confirmed vs present per department and per semester. | same |
| O4-03 | **Attendee list.** Every confirmed participant with present/absent, entry time, gate, how the entry was recorded (QR scan, typed code, marked by organizer) and by whom; filter, search, department, pagination. | `GET /manage/events/{id}/attendance/list` |
| O4-04 | **Manual correction with a reason.** *Mark present* (no phone, broken screen) records an entry with method `OVERRIDE` and uses up the pass so it can't also be scanned. *Mark absent* removes a wrong entry; while the event runs the pass works again. Both need a reason, are audited, and are only possible once the gates have opened. | `POST …/attendance`, `POST …/attendance/{registrationId}/remove` |
| O4-05 | **Live view.** Scans and corrections are pushed to organizers watching the event (Server-Sent Events) the moment they are committed; the page falls back to polling if the stream drops. | `LiveFeed`, `GET …/live` |
| O4-06 | **Attendance reports.** Present list, absentees / no-shows, all registrations — Excel, PDF or CSV. | see O5-04 |
| O4-07 | **Campus map.** Every active venue on an OpenStreetMap map, coloured by type, with search, type filters and "only places with upcoming events"; a popup shows the gates, the upcoming events (and whether their gates are open) and a walking-directions link. | `GET /campus/places`, `/campus` |
| O4-08 | **Guidance to the venue.** Each event page shows its venue on a small map with walking directions; each pass links to the venue on the campus map. | Event page, pass card |
| O4-09 | **Placing venues.** Admins set a venue's position by clicking or dragging on the map, and can load the 18 GNDEC campus places (with gates and positions) in one step, safely repeatable. | Venues & gates, `POST /admin/venues/campus` |

### O5 — Dashboards, analytics and reports

| ID | Requirement | Where |
|---|---|---|
| O5-01 | **Scope.** Admins see every event, organizers only the events they organise. Drafts are never counted. A date range (all time, academic year, last 30/90 days, upcoming, custom) applies to the event start. | `AnalyticsService.scope` |
| O5-02 | **Key figures.** Events (upcoming / live / ended), registrations, confirmed, waitlisted, attended, no-shows, attendance rate, fill rate. | `GET /manage/analytics` |
| O5-03 | **Charts.** Department-wise and semester-wise participation (registered, confirmed, attended), registration outcomes, registrations by category, registrations and check-ins per day (per month for long ranges), busiest gates, and an event popularity ranking (demand = confirmed + waitlisted against capacity). | Analytics page |
| O5-04 | **Reports.** Per event: attendance, absentees / no-shows, all registrations. Across events: a summary with one row per event plus department-, semester- and category-wise tables. Formats: Excel (one sheet per table), PDF (college header, page numbers), CSV. Every download is audited. | `GET /manage/reports/…`, Reports page |
| O5-05 | **Audit-log viewer.** Admins filter by action, person (name, e-mail or URN), text and dates, page through the results and export them. | `GET /admin/audit-logs`, Audit log page |

**Definitions** (used the same way in the dashboard, the reports and the report chapter): *registrations* are every request whatever happened to it; *attended* means a confirmed participant with an entry; the *attendance rate* is attended ÷ confirmed over events whose gates have opened; *no-shows* are confirmed participants who never entered, over events that have ended; the *fill rate* is confirmed ÷ capacity over events that weren't cancelled.

## API added

| Method | Path | Who |
|---|---|---|
| GET | `/manage/events/{id}/attendance` · `/attendance/list?filter=ALL\|PRESENT\|ABSENT&q=&dept=` | organizer of the event, admin |
| POST | `/manage/events/{id}/attendance` `{registrationId, gateId?, reason}` · `/attendance/{registrationId}/remove` `{reason}` | organizer of the event, admin |
| GET | `/manage/events/{id}/live` (text/event-stream: `hello`, then one `scan` per scan or correction) | organizer of the event, admin |
| GET | `/campus/places` | everyone signed in |
| POST | `/admin/venues/campus` | admin |
| GET | `/manage/analytics?from=&to=` | organizer (own events), admin (all) |
| GET | `/manage/reports/events/{id}/{attendance\|absentees\|registrations}?format=xlsx\|pdf\|csv` · `/manage/reports/summary?format=&from=&to=` | organizer (own events), admin |
| GET | `/admin/audit-logs?action=&q=&actorId=&from=&to=` · `/admin/audit-logs/actions` · `/admin/audit-logs/export?format=` | admin |

Database change: migration `V4__attendance_and_audit.sql` (same SQL for MySQL and PostgreSQL) adds `entries.override_reason` and an index on `audit_logs(action, created_at)`.

## Design notes

- **No second source of truth.** Attendance is computed from the `entries` rows written at the gate (objective 3). A manual correction is just another entry (method `OVERRIDE`) or the removal of one, so reports, dashboards and the scanner always agree.
- **Live feed.** The scan service publishes an event only when someone is watching that event, and it is sent after the database commit (`@TransactionalEventListener(AFTER_COMMIT)`), so the screen never shows a scan that was rolled back. Browsers can't add an Authorization header to `EventSource`, so the page reads the stream with `fetch`; the server closes each stream after 10 minutes and the page reconnects with a fresh token. A 25-second heartbeat keeps proxies from closing idle streams.
- **Reports on a small server.** Excel files are written with fastexcel (streaming, a few MB) instead of Apache POI, which needs far more memory than Render's free 512 MB.
- **Map.** Leaflet with OpenStreetMap tiles; no API key, no cost. The map and chart code load only when those pages are opened, so the first page stays small on phones.
- **Hardening.** Every page now carries a Content Security Policy (only the site's own scripts; map tiles and fonts from their known hosts; no framing), a Referrer-Policy and a Permissions-Policy that allows only this site to use the camera.

## Not included

E-mail notifications and "forgot password" by e-mail (no college SMTP account yet), self sign-up for students from other colleges, and pairing a phone as a scanner by QR — none of them is part of objectives 4 or 5.
