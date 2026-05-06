const db = require('./database.js');

setTimeout(() => {
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
        console.log("Tables:", tables);
        db.all("SELECT * FROM admins", [], (err, admins) => {
            if (err) {
                console.error("Error reading admins:", err.message);
            } else {
                console.log("Admins:", admins);
            }
            process.exit(0);
        });
    });
}, 1000);
