const db = require('./database');
setTimeout(() => {
    db.run("UPDATE passes SET status = 'active'", [], (err) => {
        if (err) {
            console.error('Error resetting passes:', err.message);
        } else {
            console.log('All passes have been reset to ACTIVE! Ready for demo.');
        }
        process.exit(0);
    });
}, 500);
