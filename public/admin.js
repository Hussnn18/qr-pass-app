document.addEventListener('DOMContentLoaded', () => {
    const originalFetch = window.fetch;
    window.fetch = async function(resource, config = {}) {
        if (!config.headers) config.headers = {};
        if (config.headers instanceof Headers) config.headers.append('Bypass-Tunnel-Reminder', 'true');
        else config.headers['Bypass-Tunnel-Reminder'] = 'true';
        return originalFetch(resource, config);
    };

    const host = window.location.origin;
    const adminLogin = document.getElementById('adminLogin');
    const adminDashboard = document.getElementById('adminDashboard');
    const loginAlertAdmin = document.getElementById('loginAlertAdmin');

    if (sessionStorage.getItem('admin_logged_in') === 'true') showDashboard();

    // Login
    const loginForm = document.getElementById('adminLoginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = document.getElementById('adminUser').value.trim();
            const pass = document.getElementById('adminPass').value;
            try {
                const res = await fetch(`${host}/api/admin/login`, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ username: user, password: pass }) 
                });
                const data = await res.json();
                if (data.success) { 
                    sessionStorage.setItem('admin_logged_in', 'true'); 
                    showDashboard(); 
                } else { 
                    loginAlertAdmin.textContent = data.message || 'Login failed'; 
                    loginAlertAdmin.className = 'alert alert-error'; 
                    loginAlertAdmin.classList.remove('hidden'); 
                }
            } catch (err) { 
                loginAlertAdmin.textContent = 'Connection error. Is server running?'; 
                loginAlertAdmin.className = 'alert alert-error'; 
                loginAlertAdmin.classList.remove('hidden'); 
            }
        });
    }

    document.getElementById('adminLogoutBtn').addEventListener('click', () => {
        sessionStorage.removeItem('admin_logged_in');
        adminDashboard.classList.add('hidden');
        adminLogin.classList.remove('hidden');
    });

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            document.getElementById('eventDetailPanel').classList.add('hidden'); // Hide detail overlay if switching tabs
            btn.classList.add('active');
            const target = document.getElementById(btn.dataset.tab);
            if (target) target.classList.remove('hidden');
            
            // Refresh data on tab click
            if (btn.dataset.tab === 'eventsTab') loadEvents();
            if (btn.dataset.tab === 'studentsTab') loadStudents();
            if (btn.dataset.tab === 'scannerTab') loadSharePanel();
        });
    });

    function showDashboard() {
        adminLogin.classList.add('hidden');
        adminDashboard.classList.remove('hidden');
        loadEvents(); loadStudents(); loadSharePanel(); startLiveSync();
    }

    // ======================== EVENTS ========================
    let allEvents = [];
    window.loadEvents = async function() {
        try {
            const res = await fetch(`${host}/api/admin/events`);
            const data = await res.json();
            allEvents = data.events || [];
            renderEvents();
        } catch (err) {
            console.error('Load events error:', err);
            document.getElementById('eventsList').innerHTML = '<p style="color:var(--error)">Error loading events.</p>';
        }
    }

    function renderEvents() {
        const list = document.getElementById('eventsList');
        if (!allEvents.length) { list.innerHTML = '<p style="color:var(--text-secondary)">No events yet.</p>'; return; }
        list.innerHTML = allEvents.map(ev => {
            const pct = ev.max_capacity > 0 ? Math.min(100, Math.round((ev.confirmed_count / ev.max_capacity) * 100)) : 0;
            const typeBadge = ev.event_type === 'registration_based' ? '<span class="type-badge reg">Registration</span>' : '<span class="type-badge auto">Auto-Assigned</span>';
            const statusBadge = ev.status === 'closed' ? '<span class="status-pill closed">Closed</span>' : '<span class="status-pill open">Active</span>';
            let audience = 'All Students';
            try { 
                const t = JSON.parse(ev.target_audience); 
                if (t.type === 'filter') { 
                    const parts = []; 
                    if (t.departments?.length) parts.push(t.departments.join(', ')); 
                    if (t.years?.length) parts.push('Year ' + t.years.join(',')); 
                    if (t.sections?.length) parts.push('Sec ' + t.sections.join(',')); 
                    audience = parts.join(' · ') || 'Filtered'; 
                } 
            } catch {}
            return `<div class="event-card-enhanced">
                <div class="ev-top">
                    <div class="ev-title">${ev.name}</div>
                    <div class="ev-badges">${typeBadge}${statusBadge}</div>
                </div>
                <div class="ev-meta">📅 ${ev.date} · 🕐 ${ev.start_time || ev.time}–${ev.end_time || ''} · 📍 ${ev.venue}</div>
                <div class="ev-meta">🎯 ${audience}</div>
                <div class="capacity-bar-wrap">
                    <div class="capacity-bar"><div class="capacity-fill" style="width:${pct}%"></div></div>
                    <span class="capacity-text">${ev.confirmed_count}/${ev.max_capacity} confirmed · ${ev.waitlisted_count} waitlisted</span>
                </div>
                <div class="ev-actions">
                    <button class="btn-action view" onclick="viewEvent(${ev.id})">👥 Participants</button>
                    ${ev.event_type === 'auto_assigned' && ev.status === 'active' ? `<button class="btn-action assign" onclick="assignAll(${ev.id})">⚡ Assign All</button>` : ''}
                    ${ev.status === 'active' ? `<button class="btn-action close-ev" onclick="closeEvent(${ev.id})">🔒 Close</button>` : ''}
                    <button class="btn-action del" onclick="deleteEvent(${ev.id})">🗑️</button>
                </div>
            </div>`;
        }).join('');
    }

    window.toggleFilters = function() {
        const val = document.querySelector('input[name="evtAudience"]:checked').value;
        document.getElementById('filterSection').classList.toggle('hidden', val === 'all');
    };

    window.addEvent = async function() {
        const name = document.getElementById('evtName').value.trim();
        const date = document.getElementById('evtDate').value;
        const venue = document.getElementById('evtVenue').value.trim();
        const start_time = document.getElementById('evtStartTime').value;
        const end_time = document.getElementById('evtEndTime').value;
        const max_capacity = parseInt(document.getElementById('evtCapacity').value) || 9999;
        const event_type = document.querySelector('input[name="evtType"]:checked').value;
        const audienceType = document.querySelector('input[name="evtAudience"]:checked').value;
        const alertEl = document.getElementById('eventsAlert');

        if (!name || !date || !venue) { showPanelAlert(alertEl, 'Name, Date, Venue are required!', 'error'); return; }

        let target_audience = { type: 'all' };
        if (audienceType === 'filter') {
            const departments = [...document.querySelectorAll('#deptChips input:checked')].map(c => c.value);
            const years = [...document.querySelectorAll('#yearChips input:checked')].map(c => parseInt(c.value));
            const sections = [...document.querySelectorAll('#secChips input:checked')].map(c => c.value);
            target_audience = { type: 'filter', departments, years, sections };
        }

        try {
            const res = await fetch(`${host}/api/admin/events`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ name, date, venue, start_time, end_time, max_capacity, event_type, target_audience }) 
            });
            const data = await res.json();
            if (data.success) {
                ['evtName','evtDate','evtVenue','evtCapacity'].forEach(id => document.getElementById(id).value = '');
                showPanelAlert(alertEl, 'Event created!', 'success');
                loadEvents();
            } else showPanelAlert(alertEl, data.message || 'Error creating event', 'error');
        } catch { showPanelAlert(alertEl, 'Network error', 'error'); }
    };

    window.deleteEvent = async function(id) {
        if (!confirm('Delete this event and all passes?')) return;
        try {
            const res = await fetch(`${host}/api/admin/events/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                if (currentEventId === id) closeEventDetail();
                else loadEvents();
            } else alert(data.message || 'Error deleting');
        } catch { alert('Network error'); }
    };

    window.closeEvent = async function(id) {
        if (!confirm('Close registrations for this event?')) return;
        try {
            const res = await fetch(`${host}/api/admin/events/${id}/close`, { method: 'PATCH' });
            const data = await res.json();
            if (data.success) {
                if (currentEventId === id) loadEventDetail();
                else loadEvents();
            } else alert(data.message || 'Error closing');
        } catch { alert('Network error'); }
    };

    window.assignAll = async function(id) {
        if (!confirm('Assign this event to all eligible students?')) return;
        try {
            const res = await fetch(`${host}/api/admin/events/${id}/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
            const data = await res.json();
            if (data.success) { alert(`Assigned: ${data.assigned}, Skipped: ${data.skipped}`); loadEvents(); }
            else alert(data.message || 'Error assigning');
        } catch { alert('Network error'); }
    };

    // ======================== EVENT DETAIL ========================
    let currentEventId = null;
    let currentTab = 'confirmed';

    window.viewEvent = async function(id) {
        currentEventId = id;
        currentTab = 'confirmed';
        document.getElementById('eventDetailPanel').classList.remove('hidden');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        await loadEventDetail();
    };

    window.closeEventDetail = function() {
        document.getElementById('eventDetailPanel').classList.add('hidden');
        document.getElementById('eventsTab').classList.remove('hidden');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('[data-tab="eventsTab"]').classList.add('active');
        loadEvents();
    };

    async function loadEventDetail() {
        try {
            const res = await fetch(`${host}/api/admin/events/${currentEventId}`);
            const data = await res.json();
            if (!data.success) throw new Error(data.message);
            const ev = data.event;
            document.getElementById('detailEventName').textContent = `🎟️ ${ev.name}`;
            document.getElementById('detailEventMeta').innerHTML = `📅 ${ev.date} · 🕐 ${ev.start_time}–${ev.end_time} · 📍 ${ev.venue}<br>🎯 Type: ${ev.event_type === 'registration_based' ? 'Registration-Based' : 'Auto-Assigned'}`;
            document.getElementById('detailStats').innerHTML = `
                <div class="stat-box confirmed"><div class="stat-num">${ev.confirmed_count}</div><div class="stat-label">Confirmed</div></div>
                <div class="stat-box waitlisted"><div class="stat-num">${ev.waitlisted_count}</div><div class="stat-label">Waitlisted</div></div>
                <div class="stat-box remaining"><div class="stat-num">${ev.remaining}</div><div class="stat-label">Remaining</div></div>
                <div class="stat-box total"><div class="stat-num">${ev.max_capacity}</div><div class="stat-label">Capacity</div></div>`;
            let actionsHtml = '';
            if (ev.status === 'active') {
                if (ev.event_type === 'auto_assigned') actionsHtml += `<button class="btn-sm" onclick="assignAll(${ev.id})" style="width:auto;margin-right:0.5rem">⚡ Assign Eligible</button>`;
                actionsHtml += `<button class="btn-sm" onclick="addParticipantPrompt(${ev.id})" style="width:auto;margin-right:0.5rem;background:var(--primary)">👤 Add Student</button>`;
                actionsHtml += `<button class="btn-sm" onclick="closeEventDetailView(${ev.id})" style="width:auto;margin-right:0.5rem;background:rgba(245,158,11,0.2);color:#fde68a;border:1px solid rgba(245,158,11,0.4)">🔒 Close</button>`;
            }
            actionsHtml += `<button class="btn-sm" onclick="deleteEventDetailView(${ev.id})" style="width:auto;background:rgba(239,68,68,0.2);color:#fca5a5;border:1px solid rgba(239,68,68,0.4)">🗑️ Delete</button>`;
            document.getElementById('detailActions').innerHTML = actionsHtml;
            await loadParticipants();
        } catch (err) {
            alert('Error loading detail: ' + err.message);
            closeEventDetail();
        }
    }

    window.switchParticipantTab = function(tab) {
        currentTab = tab;
        document.querySelectorAll('.detail-tab-btn').forEach(b => b.classList.remove('active'));
        if (tab === 'confirmed') document.querySelector('.detail-tab-btn:first-child').classList.add('active');
        else document.querySelector('.detail-tab-btn:last-child').classList.add('active');
        loadParticipants();
    };

    window.closeEventDetailView = async function(id) { await window.closeEvent(id); };
    window.deleteEventDetailView = async function(id) { await window.deleteEvent(id); };

    window.addParticipantPrompt = async function(id) {
        const urn = prompt("Enter Student URN to add:");
        if (!urn) return;
        const alertEl = document.getElementById('eventsAlert');
        try {
            const res = await fetch(`${host}/api/admin/events/${id}/assign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ students: [urn.trim().toUpperCase()] })
            });
            const data = await res.json();
            if (data.success && data.assigned > 0) {
                showPanelAlert(alertEl, `Student ${urn} added!`, 'success');
                await loadEventDetail();
            } else alert(data.message || "Could not add student. Check eligibility or capacity.");
        } catch { alert("Network error"); }
    };

    async function loadParticipants() {
        try {
            const res = await fetch(`${host}/api/admin/events/${currentEventId}/participants`);
            const data = await res.json();
            const filtered = (data.participants || []).filter(p => p.status === currentTab);
            const list = document.getElementById('participantsList');
            if (!filtered.length) { list.innerHTML = `<p style="color:var(--text-secondary);padding:1rem">No ${currentTab} participants.</p>`; return; }
            list.innerHTML = filtered.map(p => {
                const initials = (p.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
                const avatar = p.photo_url ? `<img src="${p.photo_url}" class="student-thumb">` : `<div class="student-initials">${initials}</div>`;
                const actions = currentTab === 'waitlisted'
                    ? `<button class="btn-toggle" onclick="promoteParticipant('${p.urn}')">Promote</button><button class="btn-del" onclick="removeParticipant('${p.urn}')">Remove</button>`
                    : `<button class="btn-del" onclick="removeParticipant('${p.urn}')">Remove</button>`;
                return `<div class="data-item">${avatar}<div class="info"><strong>${p.name} (${p.urn})</strong><span>${p.branch || ''} ${p.year ? '· Y'+p.year : ''} ${p.section ? '· Sec '+p.section : ''}</span></div><div class="action-btns">${actions}</div></div>`;
            }).join('');
        } catch { document.getElementById('participantsList').innerHTML = '<p style="color:var(--error)">Error loading participants.</p>'; }
    }

    window.promoteParticipant = async function(urn) {
        try {
            await fetch(`${host}/api/admin/events/${currentEventId}/participants/${urn}/promote`, { method: 'PATCH' });
            loadEventDetail();
        } catch { alert('Network error'); }
    };

    window.removeParticipant = async function(urn) {
        if (!confirm(`Remove ${urn}?`)) return;
        try {
            await fetch(`${host}/api/admin/events/${currentEventId}/participants/${urn}`, { method: 'DELETE' });
            loadEventDetail();
        } catch { alert('Network error'); }
    };

    // ======================== STUDENTS ========================
    window.loadStudents = async function() {
        try {
            const res = await fetch(`${host}/api/admin/students`);
            const data = await res.json();
            const list = document.getElementById('studentsList');
            if (!data.students?.length) { list.innerHTML = '<p style="color:var(--text-secondary)">No students yet.</p>'; return; }
            list.innerHTML = data.students.map(s => {
                const initials = (s.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
                const avatar = s.photo_url ? `<img src="${s.photo_url}" class="student-thumb">` : `<div class="student-initials">${initials}</div>`;
                return `<div class="data-item">${avatar}<div class="info"><strong>${s.name} (${s.urn})</strong><span>${s.branch ? '📚 '+s.branch : ''} ${s.year ? '· Y'+s.year : ''} ${s.section ? '· Sec '+s.section : ''} · ${s.is_enrolled ? '<span class="enrolled-yes">✅ Enrolled</span>' : '<span class="enrolled-no">❌ Not Enrolled</span>'}</span></div><div class="action-btns"><button class="btn-toggle" onclick="toggleStudent('${s.urn}')">${s.is_enrolled ? 'Suspend' : 'Activate'}</button><button class="btn-del" onclick="deleteStudent('${s.urn}')">Delete</button></div></div>`;
            }).join('');
        } catch { document.getElementById('studentsList').innerHTML = '<p style="color:var(--error)">Error loading students.</p>'; }
    }

    window.addStudent = async function() {
        const urn = document.getElementById('stuUrn').value.trim();
        const name = document.getElementById('stuName').value.trim();
        const password = document.getElementById('stuPass').value.trim();
        const branch = document.getElementById('stuBranch').value.trim();
        const year = document.getElementById('stuYear').value;
        const section = document.getElementById('stuSection').value.trim();
        const photoFile = document.getElementById('stuPhoto').files[0];
        const alertEl = document.getElementById('studentsAlert');

        if (!urn || !name || !password) { showPanelAlert(alertEl, 'URN, Name, Password required!', 'error'); return; }

        try {
            const res = await fetch(`${host}/api/admin/students`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urn, name, password, branch, year: year ? parseInt(year) : null, section: section || null }) });
            const data = await res.json();
            if (!data.success) { showPanelAlert(alertEl, data.message, 'error'); return; }

            if (photoFile) {
                const fd = new FormData(); fd.append('photo', photoFile);
                try { await fetch(`${host}/api/admin/students/${urn}/photo`, { method: 'POST', body: fd }); } catch {}
            }
            ['stuUrn','stuName','stuPass','stuBranch','stuSection'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            document.getElementById('stuYear').value = '';
            document.getElementById('stuPhoto').value = '';
            showPanelAlert(alertEl, 'Student added!', 'success');
            loadStudents();
        } catch { showPanelAlert(alertEl, 'Network error', 'error'); }
    };

    window.deleteStudent = async function(urn) {
        if (!confirm(`Delete ${urn}?`)) return;
        try {
            await fetch(`${host}/api/admin/students/${urn}`, { method: 'DELETE' });
            loadStudents();
        } catch { alert('Network error'); }
    };

    window.toggleStudent = async function(urn) {
        try {
            await fetch(`${host}/api/admin/students/${urn}/toggle`, { method: 'PATCH' });
            loadStudents();
        } catch { alert('Network error'); }
    };

    // ======================== SHARE PANEL ========================
    window.loadSharePanel = async function() {
        try {
            const res = await fetch(`${host}/api/server-info`);
            const data = await res.json();
            const select = document.getElementById('ipSelect');
            if (!data.ips?.length) { document.getElementById('shareLinkText').textContent = 'No network found.'; return; }
            select.innerHTML = `<option value="${window.location.origin}">Current Domain</option>` + data.ips.map(n => `<option value="http://${n.ip}:${data.port}">${n.name} (${n.ip})</option>`).join('');
            updateShareLink();
        } catch { document.getElementById('shareLinkText').textContent = 'Network error.'; }
    }

    window.updateShareLink = function() {
        const base = document.getElementById('ipSelect').value;
        if (!base) return;
        let url = `${base}/scanner.html`;
        const gateId = document.getElementById('shareGateId').value.trim();
        if (gateId) url += `?gateId=${encodeURIComponent(gateId)}`;
        document.getElementById('shareLinkText').textContent = url;
        const canvas = document.getElementById('shareQrCanvas');
        if (canvas) QRCode.toCanvas(canvas, url, { width: 110, margin: 1, color: { dark: '#111', light: '#fff' } });
    };

    window.copyShareLink = function() {
        navigator.clipboard.writeText(document.getElementById('shareLinkText').textContent).then(() => {
            const btn = document.querySelector('.share-link button');
            if (btn) { btn.textContent = '✅'; setTimeout(() => btn.textContent = '📋', 1500); }
        });
    };

    // ======================== LIVE SYNC ========================
    let evtSource = null;
    function startLiveSync() {
        if (evtSource) return;
        const statusEl = document.getElementById('sseStatus');
        evtSource = new EventSource(`${host}/api/admin/live-sync`);
        evtSource.onopen = () => { statusEl.textContent = '🟢 Connected'; statusEl.style.color = 'var(--success)'; };
        evtSource.onerror = () => { statusEl.textContent = '🔴 Disconnected'; statusEl.style.color = 'var(--error)'; };
        evtSource.onmessage = (event) => {
            try {
                const p = JSON.parse(event.data);
                if (p.type === 'scanner_connected') addScanner(p.data);
                else if (p.type === 'scan_result') addScan(p.data);
            } catch {}
        };
    }

    function addScanner(d) {
        if (document.getElementById('scanner-' + d.deviceId)) return;
        const t = new Date(d.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const div = document.createElement('div'); div.className = 'feed-item info'; div.id = 'scanner-' + d.deviceId;
        div.innerHTML = `<span class="status-icon">📱</span><div class="feed-item-content"><strong>${d.deviceName}</strong><span>Connected</span></div><span class="feed-time">${t}</span>`;
        document.getElementById('activeScannersList').prepend(div);
    }

    function addScan(d) {
        const t = new Date(d.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const icon = d.status === 'success' ? '✅' : d.status === 'warning' ? '⚠️' : '❌';
        const div = document.createElement('div'); div.className = `feed-item ${d.status}`;
        div.innerHTML = `<span class="status-icon">${icon}</span><div class="feed-item-content"><strong>${d.student}</strong><span>${d.event} • ${d.deviceName}</span><span style="display:block;margin-top:2px"><em>${d.message}</em></span></div><span class="feed-time">${t}</span>`;
        const list = document.getElementById('liveScansList');
        if (list) {
            list.prepend(div);
            while (list.children.length > 50) list.removeChild(list.lastChild);
        }
    }

    function showPanelAlert(el, msg, type) {
        if (!el) return;
        el.textContent = msg; el.className = `page-alert ${type}`; el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 4000);
    }
});
