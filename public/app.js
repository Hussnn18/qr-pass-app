document.addEventListener('DOMContentLoaded', () => {
    const loginScreen = document.getElementById('loginScreen');
    const loginForm = document.getElementById('loginForm');
    const urnInput = document.getElementById('urn');
    const passwordInput = document.getElementById('password');
    const loginBtn = document.getElementById('loginBtn');
    const loginAlert = document.getElementById('loginAlert');
    const dashboardScreen = document.getElementById('dashboardScreen');
    const studentNameEl = document.getElementById('studentName');
    const logoutBtn = document.getElementById('logoutBtn');
    const passesContainer = document.getElementById('passesContainer');
    const activeEventsContainer = document.getElementById('activeEventsContainer');

    const storedUser = localStorage.getItem('qr_user');
    if (storedUser) showDashboard(JSON.parse(storedUser));

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const urn = urnInput.value.trim();
            const password = passwordInput.value;
            loginBtn.textContent = 'Logging in...';
            loginBtn.disabled = true;
            hideAlert();
            try {
                const host = window.location.origin;
                const response = await fetch(`${host}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urn, password }) });
                const data = await response.json();
                if (data.success) { localStorage.setItem('qr_user', JSON.stringify(data.user)); showDashboard(data.user); }
                else showAlert(data.message, 'error');
            } catch { showAlert('Connection error. Is the server running?', 'error'); }
            finally { loginBtn.textContent = 'Login'; loginBtn.disabled = false; }
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('qr_user');
            loginScreen.classList.remove('hidden');
            dashboardScreen.classList.add('hidden');
            urnInput.value = ''; passwordInput.value = '';
        });
    }

    function showDashboard(user) {
        loginScreen.classList.add('hidden');
        dashboardScreen.classList.remove('hidden');
        studentNameEl.textContent = user.name;
        loadActiveEvents(user.urn);
        loadPasses(user.urn);
    }

    // ======================== ACTIVE EVENTS ========================
    async function loadActiveEvents(urn) {
        try {
            const host = window.location.origin;
            const response = await fetch(`${host}/api/events/available/${urn}`);
            const data = await response.json();
            if (data.success) renderActiveEvents(data.events, urn);
            else activeEventsContainer.innerHTML = '<p style="color:var(--text-secondary)">Could not load events.</p>';
        } catch { activeEventsContainer.innerHTML = '<p style="color:var(--text-secondary)">Connection error.</p>'; }
    }

    function renderActiveEvents(events, urn) {
        if (!events || events.length === 0) {
            activeEventsContainer.innerHTML = '<p style="color:var(--text-secondary)">No active events available for you right now.</p>';
            // Hide section if no events
            document.getElementById('activeEventsSection').style.display = 'none';
            document.querySelector('.section-divider').style.display = 'none';
            return;
        }
        document.getElementById('activeEventsSection').style.display = '';
        document.querySelector('.section-divider').style.display = '';

        activeEventsContainer.innerHTML = events.map(ev => {
            const pct = ev.max_capacity > 0 ? Math.min(100, Math.round((ev.confirmed_count / ev.max_capacity) * 100)) : 0;
            const isFull = ev.remaining <= 0;
            let statusHtml, btnHtml;

            if (ev.registration_status === 'confirmed') {
                statusHtml = '<span class="reg-status confirmed">✅ Confirmed</span>';
                btnHtml = '<button class="btn-register registered" disabled>Already Registered</button>';
            } else if (ev.registration_status === 'waitlisted') {
                statusHtml = '<span class="reg-status waitlisted">⏳ Waitlisted</span>';
                btnHtml = '<button class="btn-register registered" disabled>On Waitlist</button>';
            } else {
                statusHtml = '<span class="reg-status not-reg">🔓 Not Registered</span>';
                btnHtml = `<button class="btn-register" onclick="registerForEvent(${ev.id}, '${urn}')" id="regBtn-${ev.id}">${isFull ? '📋 Join Waitlist' : '🎫 Register'}</button>`;
            }

            return `<div class="event-card-student">
                <div class="ecs-header">
                    <div class="ecs-name">${ev.name}</div>
                    ${statusHtml}
                </div>
                <div class="ecs-meta">
                    📅 ${ev.date} · 🕐 ${ev.start_time || ev.time}–${ev.end_time || ''}<br>
                    📍 ${ev.venue}
                </div>
                <div class="capacity-bar-wrap">
                    <div class="capacity-bar"><div class="capacity-fill ${isFull ? 'full' : ''}" style="width:${pct}%"></div></div>
                    <span class="capacity-text">${ev.confirmed_count}/${ev.max_capacity} seats filled</span>
                </div>
                ${btnHtml}
            </div>`;
        }).join('');
    }

    window.registerForEvent = async function(eventId, urn) {
        const btn = document.getElementById(`regBtn-${eventId}`);
        if (btn) { btn.textContent = 'Registering...'; btn.disabled = true; }
        try {
            const host = window.location.origin;
            const res = await fetch(`${host}/api/events/${eventId}/register/${urn}`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
            const data = await res.json();
            if (data.success) {
                // Reload both sections
                loadActiveEvents(urn);
                loadPasses(urn);
                // Show feedback
                const msg = data.status === 'confirmed' ? '✅ Registration confirmed! Your QR pass is ready below.' : '⏳ Event is full. You have been added to the waitlist.';
                showAlert(msg, data.status === 'confirmed' ? 'success' : 'warning');
                setTimeout(hideAlert, 5000);
            } else {
                if (btn) { btn.textContent = 'Register'; btn.disabled = false; }
                showAlert(data.message, 'error');
                setTimeout(hideAlert, 4000);
            }
        } catch {
            if (btn) { btn.textContent = 'Register'; btn.disabled = false; }
            showAlert('Registration failed. Try again.', 'error');
        }
    };

    // ======================== PASSES ========================
    async function loadPasses(urn) {
        try {
            const host = window.location.origin;
            const response = await fetch(`${host}/api/passes/${urn}`);
            const data = await response.json();
            if (data.success) renderPasses(data.passes);
            else passesContainer.innerHTML = '<div class="alert alert-error">Failed to load passes.</div>';
        } catch { passesContainer.innerHTML = '<div class="alert alert-error">Connection error loading passes.</div>'; }
    }

    function renderPasses(passes) {
        if (!passes || passes.length === 0) {
            passesContainer.innerHTML = '<p style="color:var(--text-secondary)">No confirmed passes yet. Register for events above!</p>';
            return;
        }
        passesContainer.innerHTML = passes.map((pass, idx) => {
            const nameInitials = (pass.student_name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
            const photoHtml = pass.student_photo ? `<img src="${pass.student_photo}" alt="Photo">` : nameInitials;
            return `<div class="pass-card" id="pass-card-${idx}">
                <div class="pass-accent"></div>
                <div class="pass-body">
                    <div class="pass-photo">${photoHtml}</div>
                    <div class="pass-details">
                        <div class="pass-student-name">${pass.student_name || 'Student'}</div>
                        <div class="pass-urn">${pass.student_urn}</div>
                        ${pass.student_branch ? `<div class="pass-branch">📚 ${pass.student_branch}</div>` : ''}
                        <div class="pass-divider"></div>
                        <div class="pass-event-name">🎟️ ${pass.event_name}</div>
                        <div class="pass-meta">📅 ${pass.event_date} · 🕐 ${pass.start_time || pass.time}–${pass.end_time || ''}<br>📍 ${pass.venue}</div>
                        <span class="status-badge status-active">✅ Confirmed</span>
                    </div>
                </div>
                <div class="pass-qr-section">
                    <img src="${pass.qrCode}" alt="QR Code" title="Click to enlarge" onclick="window.open('${pass.qrCode}', '_blank')">
                    <span class="pass-qr-label">Scan to Verify</span>
                    <button class="btn-download" onclick="printPass(${idx})">🖨️ Print Pass</button>
                </div>
            </div>`;
        }).join('');
    }

    window.printPass = function(idx) {
        const card = document.getElementById(`pass-card-${idx}`);
        if (!card) return;
        card.classList.add('print-target');
        window.print();
        card.classList.remove('print-target');
    };

    function showAlert(message, type) {
        loginAlert.textContent = message;
        loginAlert.className = `alert alert-${type}`;
        loginAlert.classList.remove('hidden');
    }
    function hideAlert() { loginAlert.classList.add('hidden'); }
});
