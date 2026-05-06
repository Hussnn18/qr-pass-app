const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const db = require('./database');

let sseClients = [];
function broadcastAdminEvent(type, payload) {
    const data = JSON.stringify({ type, data: payload });
    sseClients.forEach(c => c.write(`data: ${data}\n\n`));
}

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 3000;
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `${req.params.urn}${path.extname(file.originalname) || '.jpg'}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => { file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Only images')); } });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper: check if student matches event target audience
function isEligible(student, targetAudience) {
    try {
        const t = typeof targetAudience === 'string' ? JSON.parse(targetAudience) : targetAudience;
        if (t.type === 'all') return true;
        if (t.departments && t.departments.length && !t.departments.includes(student.branch)) return false;
        if (t.years && t.years.length && !t.years.includes(student.year)) return false;
        if (t.sections && t.sections.length && !t.sections.includes(student.section)) return false;
        return true;
    } catch { return true; }
}

// Helper: promisify db calls
const dbAll = (sql, params = []) => new Promise((res, rej) => db.all(sql, params, (e, rows) => e ? rej(e) : res(rows)));
const dbGet = (sql, params = []) => new Promise((res, rej) => db.get(sql, params, (e, row) => e ? rej(e) : res(row)));
const dbRun = (sql, params = []) => new Promise((res, rej) => db.run(sql, params, function(e) { e ? rej(e) : res({ lastID: this.lastID, changes: this.changes }); }));

// ==================== AUTH ====================
app.post('/api/login', async (req, res) => {
    try {
        const { urn, password } = req.body;
        const row = await dbGet("SELECT * FROM students WHERE urn = ? AND password = ?", [urn, password]);
        if (!row) return res.status(401).json({ success: false, message: "Invalid URN or Password." });
        if (!row.is_enrolled) return res.status(403).json({ success: false, message: "Student is not currently enrolled." });
        res.json({ success: true, user: { urn: row.urn, name: row.name, branch: row.branch || '', year: row.year, section: row.section, photo_url: row.photo_url || null } });
    } catch (e) { res.status(500).json({ success: false, message: "Database Error" }); }
});

app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const row = await dbGet("SELECT * FROM admins WHERE username = ? AND password = ?", [username, password]);
        if (row) return res.json({ success: true });
        res.status(401).json({ success: false, message: "Invalid admin credentials." });
    } catch (e) { res.status(500).json({ success: false, message: "DB Error" }); }
});

// ==================== PASSES (Student) ====================
app.get('/api/passes/:urn', async (req, res) => {
    try {
        const urn = req.params.urn;
        const student = await dbGet("SELECT * FROM students WHERE urn = ?", [urn]);
        if (!student) return res.status(404).json({ success: false, message: "Student not found" });

        const passes = await dbAll(
            `SELECT p.*, e.name as event_name, e.date as event_date, e.time, e.venue, e.start_time, e.end_time 
             FROM passes p JOIN events e ON p.event_id = e.id 
             WHERE p.student_urn = ? AND p.status = 'confirmed'`, [urn]
        );

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const passesWithQRs = await Promise.all(passes.map(async (pass) => {
            const verifyUrl = `${baseUrl}/verify/${pass.id}`;
            const qrCodeDataURL = await QRCode.toDataURL(verifyUrl, { errorCorrectionLevel: 'H', color: { dark: '#111111', light: '#ffffff' } });
            return { ...pass, qrCode: qrCodeDataURL, student_name: student.name, student_branch: student.branch || '', student_photo: student.photo_url || null };
        }));
        res.json({ success: true, passes: passesWithQRs });
    } catch (e) { res.status(500).json({ success: false, message: "Error loading passes" }); }
});

// ==================== AVAILABLE EVENTS (Student Portal) ====================
app.get('/api/events/available/:urn', async (req, res) => {
    try {
        const student = await dbGet("SELECT * FROM students WHERE urn = ?", [req.params.urn]);
        if (!student) return res.status(404).json({ success: false, message: "Student not found" });

        const events = await dbAll("SELECT * FROM events WHERE status = 'active' AND event_type = 'registration_based' ORDER BY date ASC");
        const eligible = [];
        for (const ev of events) {
            if (!isEligible(student, ev.target_audience)) continue;
            const counts = await dbGet("SELECT COUNT(CASE WHEN status='confirmed' THEN 1 END) as confirmed, COUNT(CASE WHEN status='waitlisted' THEN 1 END) as waitlisted FROM passes WHERE event_id = ?", [ev.id]);
            const reg = await dbGet("SELECT status FROM passes WHERE event_id = ? AND student_urn = ?", [ev.id, student.urn]);
            eligible.push({ ...ev, confirmed_count: counts.confirmed, waitlisted_count: counts.waitlisted, remaining: ev.max_capacity - counts.confirmed, registration_status: reg ? reg.status : null });
        }
        res.json({ success: true, events: eligible });
    } catch (e) { res.status(500).json({ success: false, message: "Error fetching events" }); }
});

// ==================== STUDENT REGISTRATION ====================
app.post('/api/events/:id/register/:urn', async (req, res) => {
    try {
        const { id, urn } = req.params;
        const student = await dbGet("SELECT * FROM students WHERE urn = ? AND is_enrolled = 1", [urn]);
        if (!student) return res.status(404).json({ success: false, message: "Student not found or not enrolled" });

        const event = await dbGet("SELECT * FROM events WHERE id = ? AND status = 'active'", [id]);
        if (!event) return res.status(404).json({ success: false, message: "Event not found or closed" });
        if (event.event_type !== 'registration_based') return res.status(400).json({ success: false, message: "This event doesn't support registration" });
        if (!isEligible(student, event.target_audience)) return res.status(403).json({ success: false, message: "You are not eligible for this event" });

        const existing = await dbGet("SELECT * FROM passes WHERE event_id = ? AND student_urn = ?", [id, urn]);
        if (existing) return res.status(409).json({ success: false, message: "Already registered", status: existing.status });

        const counts = await dbGet("SELECT COUNT(*) as c FROM passes WHERE event_id = ? AND status = 'confirmed'", [id]);
        const passId = uuidv4();
        let status;
        if (counts.c < event.max_capacity) {
            status = 'confirmed';
            await dbRun("INSERT INTO passes (id, student_urn, event_id, status, confirmed_at) VALUES (?,?,?,?,datetime('now'))", [passId, urn, id, status]);
        } else {
            status = 'waitlisted';
            await dbRun("INSERT INTO passes (id, student_urn, event_id, status) VALUES (?,?,?,?)", [passId, urn, id, status]);
        }
        res.json({ success: true, status, message: status === 'confirmed' ? 'Registration confirmed! QR pass generated.' : 'Event is full. You have been waitlisted.' });
    } catch (e) { res.status(500).json({ success: false, message: "Registration error" }); }
});

// ==================== VERIFICATION ====================
app.post('/api/verify', async (req, res) => {
    const { passId, deviceId, deviceName } = req.body;
    if (!passId) return res.status(400).json({ success: false, message: "Missing QR pass data." });

    try {
        const pass = await dbGet(`
            SELECT p.*, s.name as student_name, s.is_enrolled, s.branch, s.photo_url, e.name as event_name 
            FROM passes p 
            JOIN students s ON p.student_urn = s.urn 
            JOIN events e ON p.event_id = e.id 
            WHERE p.id = ?`, [passId]);

        if (!pass) {
            broadcastAdminEvent('scan_result', { deviceId, deviceName, status: 'error', message: 'Invalid Pass', student: 'Unknown', event: '-', timestamp: new Date() });
            return res.status(404).json({ success: false, message: "Invalid Pass. Not found in system." });
        }
        if (!pass.is_enrolled) {
            broadcastAdminEvent('scan_result', { deviceId, deviceName, status: 'error', message: 'Not Enrolled', student: pass.student_name, event: pass.event_name, timestamp: new Date() });
            return res.status(403).json({ success: false, message: "Student is not enrolled." });
        }
        if (pass.status !== 'confirmed') {
            broadcastAdminEvent('scan_result', { deviceId, deviceName, status: 'warning', message: 'Not Confirmed', student: pass.student_name, event: pass.event_name, timestamp: new Date() });
            return res.status(403).json({ success: false, message: "Pass is not confirmed." });
        }

        // Check if already scanned
        const existingScan = await dbGet("SELECT id FROM scan_logs WHERE pass_id = ?", [passId]);
        if (existingScan) {
            broadcastAdminEvent('scan_result', { deviceId, deviceName, status: 'warning', message: 'Already Used', student: pass.student_name, event: pass.event_name, timestamp: new Date() });
            return res.status(409).json({ success: false, message: "This pass has already been used for entry." });
        }

        await dbRun("INSERT INTO scan_logs (pass_id, device_id, device_name) VALUES (?, ?, ?)", [passId, deviceId || null, deviceName || 'Unknown Device']);
        broadcastAdminEvent('scan_result', { deviceId, deviceName, status: 'success', message: 'Verified', student: pass.student_name, event: pass.event_name, timestamp: new Date() });
        res.json({ success: true, message: "Pass Verified Successfully!", details: { urn: pass.student_urn, name: pass.student_name, branch: pass.branch, photo_url: pass.photo_url, event: pass.event_name } });
    } catch (e) {
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
});

app.get('/verify/:passId', (req, res) => {
    const { passId } = req.params;
    db.get("SELECT p.*, s.name as student_name, s.is_enrolled, s.branch, s.photo_url, e.name as event_name, e.date as event_date, e.venue FROM passes p JOIN students s ON p.student_urn = s.urn JOIN events e ON p.event_id = e.id WHERE p.id = ?", [passId], (err, pass) => {
        let h = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Pass Verification</title><style>@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap');body{font-family:'Outfit',sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#0f172a,#1e1b4b);color:white;text-align:center;padding:1rem}.card{background:rgba(255,255,255,0.08);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.15);padding:2rem;border-radius:20px;width:90%;max-width:380px}.icon{font-size:3.5rem;margin-bottom:0.5rem}h1{margin:0.25rem 0 1rem;font-size:1.5rem}.detail{background:rgba(0,0,0,0.2);border-radius:10px;padding:0.6rem 1rem;margin:0.4rem 0;font-size:0.95rem;text-align:left}.detail span{color:#94a3b8;font-size:0.78rem;display:block}.success{border-color:rgba(16,185,129,0.4);background:rgba(16,185,129,0.1)}.error{border-color:rgba(239,68,68,0.4);background:rgba(239,68,68,0.1)}.badge-ok{color:#10b981}.badge-err{color:#ef4444}.photo{width:72px;height:72px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,0.2);margin-bottom:0.75rem}</style></head><body><div class="card `;
        if (err || !pass) { h += `error"><div class="icon">❌</div><h1 class="badge-err">Invalid Pass</h1><p style="color:#94a3b8">This pass was not found in the system.</p>`; }
        else if (!pass.is_enrolled) { h += `error"><div class="icon">🚫</div><h1 class="badge-err">Access Denied</h1><p style="color:#94a3b8">Student is not enrolled.</p>`; }
        else if (pass.status !== 'confirmed') { h += `error"><div class="icon">⏳</div><h1 class="badge-err">Not Confirmed</h1><p style="color:#94a3b8">This pass is waitlisted, not confirmed.</p>`; }
        else {
            db.run("INSERT INTO scan_logs (pass_id, device_id, device_name) VALUES (?, ?, ?)", [passId, 'native', 'QR Mobile Browser'], () => {});
            h += `success">${pass.photo_url ? `<img src="${pass.photo_url}" class="photo" alt="photo">` : '<div class="icon">✅</div>'}<h1 class="badge-ok">✅ Verified!</h1><div class="detail"><span>Student</span>${pass.student_name} (${pass.student_urn})</div>${pass.branch ? `<div class="detail"><span>Branch</span>${pass.branch}</div>` : ''}<div class="detail"><span>Event</span>${pass.event_name}</div><div class="detail"><span>Date & Venue</span>${pass.event_date} · ${pass.venue}</div>`;
        }
        h += `</div></body></html>`;
        res.send(h);
    });
});

// ==================== SSE ====================
app.get('/api/admin/live-sync', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE connection established' })}\n\n`);
    sseClients.push(res);
    req.on('close', () => { sseClients = sseClients.filter(c => c !== res); });
});

app.post('/api/scanner/register', (req, res) => {
    const { deviceId, deviceName } = req.body;
    if (deviceId && deviceName) broadcastAdminEvent('scanner_connected', { deviceId, deviceName, timestamp: new Date() });
    res.json({ success: true });
});

// ==================== ADMIN: EVENTS ====================
app.get('/api/admin/events', async (req, res) => {
    try {
        const events = await dbAll("SELECT * FROM events ORDER BY date ASC");
        const result = [];
        for (const ev of events) {
            const counts = await dbGet("SELECT COUNT(CASE WHEN status='confirmed' THEN 1 END) as confirmed, COUNT(CASE WHEN status='waitlisted' THEN 1 END) as waitlisted FROM passes WHERE event_id = ?", [ev.id]);
            result.push({ ...ev, confirmed_count: counts.confirmed || 0, waitlisted_count: counts.waitlisted || 0, remaining: ev.max_capacity - (counts.confirmed || 0) });
        }
        res.json({ success: true, events: result });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/admin/events', async (req, res) => {
    try {
        const { name, date, venue, start_time, end_time, max_capacity, event_type, target_audience } = req.body;
        if (!name || !date || !venue) return res.status(400).json({ success: false, message: "Name, date, venue required." });
        const ta = target_audience ? JSON.stringify(target_audience) : '{"type":"all"}';
        const r = await dbRun(
            "INSERT INTO events (name, date, time, venue, start_time, end_time, max_capacity, event_type, target_audience, status) VALUES (?,?,?,?,?,?,?,?,?,?)",
            [name, date, start_time || '09:00', venue, start_time || '09:00', end_time || '17:00', max_capacity || 9999, event_type || 'auto_assigned', ta, 'active']
        );
        res.json({ success: true, id: r.lastID });
    } catch (e) { res.status(500).json({ success: false, message: "Error adding event." }); }
});

app.get('/api/admin/events/:id', async (req, res) => {
    try {
        const ev = await dbGet("SELECT * FROM events WHERE id = ?", [req.params.id]);
        if (!ev) return res.status(404).json({ success: false, message: "Event not found" });
        const counts = await dbGet("SELECT COUNT(CASE WHEN status='confirmed' THEN 1 END) as confirmed, COUNT(CASE WHEN status='waitlisted' THEN 1 END) as waitlisted FROM passes WHERE event_id = ?", [ev.id]);
        res.json({ success: true, event: { ...ev, confirmed_count: counts.confirmed || 0, waitlisted_count: counts.waitlisted || 0, remaining: ev.max_capacity - (counts.confirmed || 0) } });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.delete('/api/admin/events/:id', async (req, res) => {
    try {
        await dbRun("DELETE FROM passes WHERE event_id = ?", [req.params.id]);
        await dbRun("DELETE FROM events WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.patch('/api/admin/events/:id/close', async (req, res) => {
    try {
        await dbRun("UPDATE events SET status = 'closed' WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// ==================== ADMIN: PARTICIPANTS ====================
app.get('/api/admin/events/:id/participants', async (req, res) => {
    try {
        const rows = await dbAll(
            `SELECT p.id as pass_id, p.status, p.registered_at, p.confirmed_at, s.urn, s.name, s.branch, s.year, s.section, s.photo_url
             FROM passes p JOIN students s ON p.student_urn = s.urn WHERE p.event_id = ? ORDER BY p.status ASC, p.registered_at ASC`, [req.params.id]
        );
        res.json({ success: true, participants: rows });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/admin/events/:id/assign', async (req, res) => {
    try {
        const event = await dbGet("SELECT * FROM events WHERE id = ?", [req.params.id]);
        if (!event) return res.status(404).json({ success: false, message: "Event not found" });

        let students;
        if (req.body.students && req.body.students.length) {
            students = await dbAll(`SELECT * FROM students WHERE urn IN (${req.body.students.map(() => '?').join(',')}) AND is_enrolled = 1`, req.body.students);
        } else {
            students = await dbAll("SELECT * FROM students WHERE is_enrolled = 1");
        }

        let assigned = 0, skipped = 0;
        const counts = await dbGet("SELECT COUNT(*) as c FROM passes WHERE event_id = ? AND status = 'confirmed'", [event.id]);
        let currentConfirmed = counts.c;

        for (const s of students) {
            if (!isEligible(s, event.target_audience)) { skipped++; continue; }
            const existing = await dbGet("SELECT * FROM passes WHERE event_id = ? AND student_urn = ?", [event.id, s.urn]);
            if (existing) { skipped++; continue; }
            if (currentConfirmed >= event.max_capacity) { skipped++; continue; }
            await dbRun("INSERT INTO passes (id, student_urn, event_id, status, confirmed_at) VALUES (?,?,?,'confirmed',datetime('now'))", [uuidv4(), s.urn, event.id]);
            assigned++;
            currentConfirmed++;
        }
        res.json({ success: true, assigned, skipped });
    } catch (e) { res.status(500).json({ success: false, message: "Assignment error" }); }
});

app.patch('/api/admin/events/:id/participants/:urn/promote', async (req, res) => {
    try {
        const pass = await dbGet("SELECT * FROM passes WHERE event_id = ? AND student_urn = ? AND status = 'waitlisted'", [req.params.id, req.params.urn]);
        if (!pass) return res.status(404).json({ success: false, message: "Waitlisted pass not found" });
        await dbRun("UPDATE passes SET status = 'confirmed', confirmed_at = datetime('now') WHERE id = ?", [pass.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.delete('/api/admin/events/:id/participants/:urn', async (req, res) => {
    try {
        await dbRun("DELETE FROM passes WHERE event_id = ? AND student_urn = ?", [req.params.id, req.params.urn]);
        // Auto-promote first waitlisted
        const next = await dbGet("SELECT * FROM passes WHERE event_id = ? AND status = 'waitlisted' ORDER BY registered_at ASC LIMIT 1", [req.params.id]);
        if (next) {
            const event = await dbGet("SELECT max_capacity FROM events WHERE id = ?", [req.params.id]);
            const counts = await dbGet("SELECT COUNT(*) as c FROM passes WHERE event_id = ? AND status = 'confirmed'", [req.params.id]);
            if (event && counts.c < event.max_capacity) {
                await dbRun("UPDATE passes SET status = 'confirmed', confirmed_at = datetime('now') WHERE id = ?", [next.id]);
            }
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

// ==================== ADMIN: STUDENTS ====================
app.get('/api/admin/students', async (req, res) => {
    try {
        const rows = await dbAll("SELECT urn, name, is_enrolled, branch, photo_url, year, section FROM students ORDER BY urn ASC");
        res.json({ success: true, students: rows });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/admin/students', async (req, res) => {
    try {
        const { urn, name, password, branch, year, section } = req.body;
        if (!urn || !name || !password) return res.status(400).json({ success: false, message: "URN, Name, Password required." });
        await dbRun("INSERT INTO students (urn, name, password, branch, year, section) VALUES (?,?,?,?,?,?)", [urn, name, password, branch || '', year || null, section || null]);
        res.json({ success: true });
    } catch (e) { res.status(409).json({ success: false, message: "URN already exists." }); }
});

app.post('/api/admin/students/:urn/photo', upload.single('photo'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });
    const photoUrl = `/uploads/${req.file.filename}`;
    db.run("UPDATE students SET photo_url = ? WHERE urn = ?", [photoUrl, req.params.urn], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true, photo_url: photoUrl });
    });
});

app.delete('/api/admin/students/:urn', async (req, res) => {
    try {
        await dbRun("DELETE FROM passes WHERE student_urn = ?", [req.params.urn]);
        await dbRun("DELETE FROM students WHERE urn = ?", [req.params.urn]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.patch('/api/admin/students/:urn/toggle', async (req, res) => {
    try {
        const row = await dbGet("SELECT is_enrolled FROM students WHERE urn = ?", [req.params.urn]);
        if (!row) return res.status(404).json({ success: false });
        const newStatus = row.is_enrolled ? 0 : 1;
        await dbRun("UPDATE students SET is_enrolled = ? WHERE urn = ?", [newStatus, req.params.urn]);
        res.json({ success: true, is_enrolled: newStatus });
    } catch (e) { res.status(500).json({ success: false }); }
});

// ==================== SERVER INFO ====================
app.get('/api/server-info', (req, res) => {
    const nets = os.networkInterfaces();
    const ips = [];
    for (const [name, iface] of Object.entries(nets)) {
        for (const addr of iface) {
            if (addr.family === 'IPv4' && !addr.internal) {
                let friendlyName = name;
                if (name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('wlan')) friendlyName = 'Wi-Fi';
                else if (name.toLowerCase().includes('ethernet') || name.toLowerCase().includes('eth')) friendlyName = 'Ethernet';
                ips.push({ ip: addr.address, name: friendlyName, rawName: name });
            }
        }
    }
    ips.sort((a, b) => a.name === 'Wi-Fi' ? -1 : b.name === 'Wi-Fi' ? 1 : 0);
    res.json({ port: PORT, ips });
});

app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));
