#!/usr/bin/env node
/**
 * Load test for the gate scanner, POST /api/v1/scan/verify (plan test T-SCAN-13: p95 < 300 ms at 50 requests/s).
 *
 *   node tools/loadtest/scan-load.mjs [baseUrl] [requestsPerSecond] [seconds]
 *   node tools/loadtest/scan-load.mjs http://localhost:8080 50 60
 *
 * Needs a server with the demo data (profile h2 or dev) and a scan limit high enough for one account to send
 * this many scans, e.g. start it with --app.scan-rate-per-minute=100000. Never run it against the live site:
 * every request is a real scan and is written to the scan log.
 *
 * Requests are sent at a fixed rate whatever the response times (an "open" model, like many gates at once).
 * The mix: 40% the URN of a confirmed participant (the first scan lets them in, later ones are "already used"),
 * 60% a random QR token (looked up by hash and refused). Every request does the full check and writes a log row.
 */
const base = (process.argv[2] || 'http://localhost:8080').replace(/\/$/, '');
const rps = Number(process.argv[3] || 50);
const seconds = Number(process.argv[4] || 60);
const GUARD = process.env.GUARD || 'gurmeet.security@gndec.demo';
const ADMIN = process.env.ADMIN || 'admin@gndec.demo';
const PASSWORD = process.env.PASSWORD || 'demo';

async function login(identifier) {
  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Sign-in failed for ${identifier}: ${res.status}`);
  return (await res.json()).accessToken;
}

const get = async (path, token) => {
  const res = await fetch(`${base}/api/v1${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
};

const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString('base64url');
};

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

const guard = await login(GUARD);
const admin = await login(ADMIN);
const now = Date.now();
const option = (await get('/scan/assignments', guard)).find((o) => o.event.startsAt - 60 * 60_000 <= now && o.event.endsAt > now);
if (!option) throw new Error('The guard has no event with its gates open right now. Restart the server to regenerate the demo data.');
const { event, gateId, gateName } = option;
const people = (await get(`/manage/events/${event.id}/attendance/list?filter=ALL&size=100`, admin)).items.map((a) => a.person.idLabel);

console.log(`Scanning "${event.title}" at ${gateName}: ${rps} requests/s for ${seconds} s (${people.length} participants in the mix)`);
const latencies = [];
const results = {};
const statuses = {};
let sent = 0;
let failed = 0;
const pending = [];
const started = performance.now();

const fire = () => {
  sent++;
  const body = Math.random() < 0.4
    ? { eventId: event.id, gateId, code: people[Math.floor(Math.random() * people.length)] }
    : { eventId: event.id, gateId, qr: `EQR1:${randomToken()}` };
  const t0 = performance.now();
  pending.push(fetch(`${base}/api/v1/scan/verify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${guard}` }, body: JSON.stringify(body),
  }).then(async (res) => {
    latencies.push(performance.now() - t0);
    statuses[res.status] = (statuses[res.status] || 0) + 1;
    if (res.ok) {
      const r = (await res.json()).result;
      results[r] = (results[r] || 0) + 1;
    }
  }).catch(() => { failed++; }));
};

const total = rps * seconds;
await new Promise((resolve) => {
  const tick = setInterval(() => {
    // Catch up to the schedule so a slow tick doesn't lower the rate.
    const due = Math.min(total, Math.floor(((performance.now() - started) / 1000) * rps));
    while (sent < due) fire();
    if (sent >= total) {
      clearInterval(tick);
      resolve();
    }
  }, 5);
});
await Promise.all(pending);
const elapsed = (performance.now() - started) / 1000;

latencies.sort((a, b) => a - b);
const ms = (v) => `${v.toFixed(1)} ms`;
console.log(JSON.stringify({
  target: `${rps}/s for ${seconds}s`,
  sent,
  achievedRate: `${(sent / elapsed).toFixed(1)}/s`,
  httpStatus: statuses,
  networkErrors: failed,
  results,
  latency: {
    p50: ms(percentile(latencies, 50)), p90: ms(percentile(latencies, 90)), p95: ms(percentile(latencies, 95)),
    p99: ms(percentile(latencies, 99)), max: ms(latencies[latencies.length - 1]),
  },
  passes: percentile(latencies, 95) < 300 && !failed && Object.keys(statuses).every((s) => s === '200'),
}, null, 2));
