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

    const changePassBtn = document.getElementById('changePassBtn');
    const passwordModal = document.getElementById('passwordModal');
    const passwordOverlay = document.getElementById('passwordOverlay');
    const closePasswordModal = document.getElementById('closePasswordModal');
    const submitPasswordBtn = document.getElementById('submitPasswordBtn');
    const passwordAlert = document.getElementById('passwordAlert');
    const currentPasswordInput = document.getElementById('currentPassword');
    const newPasswordInput = document.getElementById('newPassword');

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



    if (changePassBtn) {
        changePassBtn.addEventListener('click', () => {
            passwordModal.classList.remove('hidden');
            passwordOverlay.classList.remove('hidden');
            currentPasswordInput.value = '';
            newPasswordInput.value = '';
            passwordAlert.classList.add('hidden');
        });
    }

    if (closePasswordModal) {
        closePasswordModal.addEventListener('click', () => {
            passwordModal.classList.add('hidden');
            passwordOverlay.classList.add('hidden');
        });
    }

    if (submitPasswordBtn) {
        submitPasswordBtn.addEventListener('click', async () => {
            const currentPassword = currentPasswordInput.value;
            const newPassword = newPasswordInput.value;
            if (!currentPassword || !newPassword) {
                passwordAlert.textContent = 'Please fill all fields.';
                passwordAlert.className = 'alert alert-error';
                passwordAlert.classList.remove('hidden');
                return;
            }

            const user = JSON.parse(localStorage.getItem('qr_user'));
            if (!user) return;

            submitPasswordBtn.textContent = 'Updating...';
            submitPasswordBtn.disabled = true;

            try {
                const host = window.location.origin;
                const response = await fetch(`${host}/api/students/${user.urn}/password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ currentPassword, newPassword })
                });
                const data = await response.json();
                if (data.success) {
                    passwordAlert.textContent = 'Password updated successfully!';
                    passwordAlert.className = 'alert alert-success';
                    passwordAlert.classList.remove('hidden');
                    setTimeout(() => {
                        passwordModal.classList.add('hidden');
                        passwordOverlay.classList.add('hidden');
                    }, 1500);
                } else {
                    passwordAlert.textContent = data.message;
                    passwordAlert.className = 'alert alert-error';
                    passwordAlert.classList.remove('hidden');
                }
            } catch {
                passwordAlert.textContent = 'Connection error.';
                passwordAlert.className = 'alert alert-error';
                passwordAlert.classList.remove('hidden');
            } finally {
                submitPasswordBtn.textContent = 'Update';
                submitPasswordBtn.disabled = false;
            }
        });
    }

    const uploadPhotoBtn = document.getElementById('uploadPhotoBtn');
    const photoModal = document.getElementById('photoModal');
    const closePhotoModal = document.getElementById('closePhotoModal');
    const submitPhotoBtn = document.getElementById('submitPhotoBtn');
    const photoAlert = document.getElementById('photoAlert');
    const studentPhotoInput = document.getElementById('studentPhotoInput');

    if (uploadPhotoBtn) {
        uploadPhotoBtn.addEventListener('click', () => {
            photoModal.classList.remove('hidden');
            passwordOverlay.classList.remove('hidden');
            studentPhotoInput.value = '';
            photoAlert.classList.add('hidden');
        });
    }

    if (closePhotoModal) {
        closePhotoModal.addEventListener('click', () => {
            photoModal.classList.add('hidden');
            passwordOverlay.classList.add('hidden');
        });
    }

    if (submitPhotoBtn) {
        submitPhotoBtn.addEventListener('click', async () => {
            const photoFile = studentPhotoInput.files[0];
            if (!photoFile) {
                photoAlert.textContent = 'Please select a photo.';
                photoAlert.className = 'alert alert-error';
                photoAlert.classList.remove('hidden');
                return;
            }

            const user = JSON.parse(localStorage.getItem('qr_user'));
            if (!user) return;

            submitPhotoBtn.textContent = 'Uploading...';
            submitPhotoBtn.disabled = true;

            const fd = new FormData();
            fd.append('photo', photoFile);

            try {
                const host = window.location.origin;
                const response = await fetch(`${host}/api/students/${user.urn}/photo`, {
                    method: 'POST',
                    body: fd
                });
                const data = await response.json();
                if (data.success) {
                    photoAlert.textContent = 'Photo uploaded successfully!';
                    photoAlert.className = 'alert alert-success';
                    photoAlert.classList.remove('hidden');
                    
                    // Update user photo in local storage and reload passes
                    user.photo_url = data.photo_url;
                    localStorage.setItem('qr_user', JSON.stringify(user));
                    loadPasses(user.urn);

                    setTimeout(() => {
                        photoModal.classList.add('hidden');
                        passwordOverlay.classList.add('hidden');
                    }, 1500);
                } else {
                    photoAlert.textContent = data.message || 'Error uploading photo.';
                    photoAlert.className = 'alert alert-error';
                    photoAlert.classList.remove('hidden');
                }
            } catch {
                photoAlert.textContent = 'Connection error.';
                photoAlert.className = 'alert alert-error';
                photoAlert.classList.remove('hidden');
            } finally {
                submitPhotoBtn.textContent = 'Upload';
                submitPhotoBtn.disabled = false;
            }
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
                <div class="pass-accent">OFFICIAL ENTRY PASS</div>
                <div class="pass-body">
                    <div class="pass-photo">${photoHtml}</div>
                    <div class="pass-student-name">${pass.student_name || 'Student'}</div>
                    <div class="pass-urn">${pass.student_urn}</div>
                    ${pass.student_branch ? `<div class="pass-branch">📚 ${pass.student_branch}</div>` : ''}
                    <div class="pass-divider"></div>
                    <div class="pass-event-name">🎟️ ${pass.event_name}</div>
                    <div class="pass-meta">📅 ${pass.event_date} <br> 🕐 ${pass.start_time || pass.time}–${pass.end_time || ''} <br> 📍 ${pass.venue}</div>
                </div>
                <div class="pass-qr-section">
                    <img src="${pass.qrCode}" alt="QR Code">
                    <span class="pass-qr-label">Scan to Verify</span>
                    <button class="btn-download" onclick="printPass(${idx})">⬇️ Download PDF</button>
                </div>
            </div>`;
        }).join('');
    }

    window.printPass = async function(idx) {
        const card = document.getElementById(`pass-card-${idx}`);
        if (!card) return;
        
        // Hide the download button so it doesn't appear in the image
        const btn = card.querySelector('.btn-download');
        if (btn) btn.style.display = 'none';

        try {
            const canvas = await html2canvas(card, {
                scale: 3, // Higher resolution for PDF
                backgroundColor: '#ffffff', // Explicitly set background
                useCORS: true // Allow external images
            });
            
            const imgData = canvas.toDataURL('image/png');
            const { jsPDF } = window.jspdf;
            
            // Calculate dimensions
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;
            // Convert pixels to mm roughly (1px = 0.264583mm at 96 DPI)
            const pdfWidth = imgWidth * 0.264583 / 3; // divide by scale
            const pdfHeight = imgHeight * 0.264583 / 3;
            
            // Create PDF exactly the size of the ID card
            const pdf = new jsPDF({
                orientation: pdfWidth > pdfHeight ? 'landscape' : 'portrait',
                unit: 'mm',
                format: [pdfWidth, pdfHeight]
            });
            
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`QR_Pass_${idx}.pdf`);
        } catch(e) {
            console.error("Failed to generate PDF", e);
            alert("Error generating PDF.");
        } finally {
            if (btn) btn.style.display = 'block';
        }
    };

    function showAlert(message, type) {
        loginAlert.textContent = message;
        loginAlert.className = `alert alert-${type}`;
        loginAlert.classList.remove('hidden');
    }
    function hideAlert() { loginAlert.classList.add('hidden'); }
});
