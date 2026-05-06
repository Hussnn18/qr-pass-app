const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to SQLite database
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initializeDB();
    }
});

function initializeDB() {
    db.serialize(() => {
        // Create Students table
        db.run(`CREATE TABLE IF NOT EXISTS students (
            urn TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            is_enrolled INTEGER DEFAULT 1
        )`);

        // Migrate: add columns if not present (safe — ALTER TABLE ADD is no-op if exists)
        db.run(`ALTER TABLE students ADD COLUMN photo_url TEXT`, () => {});
        db.run(`ALTER TABLE students ADD COLUMN branch TEXT`, () => {});
        db.run(`ALTER TABLE students ADD COLUMN year INTEGER`, () => {});
        db.run(`ALTER TABLE students ADD COLUMN section TEXT`, () => {});

        // Create Events table
        db.run(`CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            date TEXT NOT NULL,
            time TEXT NOT NULL DEFAULT '09:00 AM',
            venue TEXT NOT NULL DEFAULT 'Main Auditorium'
        )`);

        // Migrate: add new event columns
        db.run(`ALTER TABLE events ADD COLUMN start_time TEXT DEFAULT '09:00'`, () => {});
        db.run(`ALTER TABLE events ADD COLUMN end_time TEXT DEFAULT '17:00'`, () => {});
        db.run(`ALTER TABLE events ADD COLUMN max_capacity INTEGER DEFAULT 9999`, () => {});
        db.run(`ALTER TABLE events ADD COLUMN event_type TEXT DEFAULT 'auto_assigned'`, () => {});
        db.run(`ALTER TABLE events ADD COLUMN target_audience TEXT DEFAULT '{"type":"all"}'`, () => {});
        db.run(`ALTER TABLE events ADD COLUMN status TEXT DEFAULT 'active'`, () => {});
        db.run(`ALTER TABLE events ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});

        // Create Passes table
        db.run(`CREATE TABLE IF NOT EXISTS passes (
            id TEXT PRIMARY KEY,
            student_urn TEXT NOT NULL,
            event_id INTEGER NOT NULL,
            status TEXT DEFAULT 'confirmed',
            FOREIGN KEY(student_urn) REFERENCES students(urn),
            FOREIGN KEY(event_id) REFERENCES events(id)
        )`);

        // Migrate: add registration tracking columns to passes
        db.run(`ALTER TABLE passes ADD COLUMN registered_at DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
        db.run(`ALTER TABLE passes ADD COLUMN confirmed_at DATETIME`, () => {});

        // Migrate existing passes: 'active' → 'confirmed'
        db.run(`UPDATE passes SET status = 'confirmed' WHERE status = 'active'`, () => {});

        // Create Scan Logs table
        db.run(`CREATE TABLE IF NOT EXISTS scan_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pass_id TEXT NOT NULL,
            device_id TEXT,
            device_name TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(pass_id) REFERENCES passes(id)
        )`);

        // Create Admins table
        db.run(`CREATE TABLE IF NOT EXISTS admins (
            username TEXT PRIMARY KEY,
            password TEXT NOT NULL
        )`);

        // Insert default admin
        db.run("INSERT OR IGNORE INTO admins (username, password) VALUES (?, ?)", ["admin", "admin123"]);

        // Insert Mock Data
        insertMockData();
    });
}

function insertMockData() {
    // Check if we already have students
    db.get("SELECT count(*) as count FROM students", (err, row) => {
        if (row && row.count === 0) {
            console.log("Inserting mock data...");

            // Mock Students with branch, year, and section
            const insertStudent = db.prepare("INSERT INTO students (urn, name, password, branch, year, section) VALUES (?, ?, ?, ?, ?, ?)");
            insertStudent.run("URN101", "Rahul Sharma", "pass123", "CSE", 3, "A");
            insertStudent.run("URN102", "Priya Patel", "pass123", "ECE", 2, "B");
            insertStudent.run("URN103", "Amit Kumar", "pass123", "CSE", 3, "A");
            insertStudent.run("URN104", "Sneha Gupta", "pass123", "ME", 4, "A");
            insertStudent.run("URN105", "Vikram Singh", "pass123", "ECE", 2, "A");
            insertStudent.finalize();

            // Mock Events — one auto-assigned, one registration-based
            db.run(`INSERT INTO events (name, date, time, venue, start_time, end_time, max_capacity, event_type, target_audience, status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                ["Anand Utsav 2026", "2026-03-05", "09:00 AM", "Open Air Theater", "09:00", "17:00", 500, "auto_assigned", '{"type":"all"}', "active"]);

            db.run(`INSERT INTO events (name, date, time, venue, start_time, end_time, max_capacity, event_type, target_audience, status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                ["Tech Workshop 2026", "2026-05-20", "10:00 AM", "Seminar Hall", "10:00", "14:00", 30, "registration_based", '{"type":"filter","departments":["CSE","ECE"],"years":[2,3]}', "active"]);

            db.run(`INSERT INTO events (name, date, time, venue, start_time, end_time, max_capacity, event_type, target_audience, status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                ["Annual Sports Day", "2026-06-10", "08:00 AM", "Sports Complex", "08:00", "18:00", 9999, "auto_assigned", '{"type":"all"}', "active"]);

            console.log("Mock data inserted successfully.");
        }
    });
}

module.exports = db;
