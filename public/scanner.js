document.addEventListener('DOMContentLoaded', () => {
    const originalFetch = window.fetch;
    window.fetch = async function(resource, config = {}) {
        if (!config.headers) config.headers = {};
        if (config.headers instanceof Headers) config.headers.append('Bypass-Tunnel-Reminder', 'true');
        else config.headers['Bypass-Tunnel-Reminder'] = 'true';
        return originalFetch(resource, config);
    };

    let html5QrcodeScanner = null;
    let isProcessing = false;
    const scanHistory = [];

    let deviceId = localStorage.getItem('deviceId') || ('dev_' + Math.random().toString(36).substr(2, 9));
    localStorage.setItem('deviceId', deviceId);
    let deviceName = localStorage.getItem('deviceName');

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('gateId')) {
        deviceName = urlParams.get('gateId');
        localStorage.setItem('deviceName', deviceName);
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    const setupPane = document.getElementById('scannerSetupPane');
    const mainApp = document.getElementById('mainScannerApp');
    const activeGateDisplay = document.getElementById('activeGateDisplay');

    // ─── Initialization ───────────────────────────────────────────────────
    if (!deviceName) {
        setupPane.style.display = 'flex';
        mainApp.style.display = 'none';
        document.getElementById('setupBtn').addEventListener('click', () => {
            const inputVal = document.getElementById('setupGateId').value.trim();
            if(!inputVal) return alert("Enter Gate ID");
            deviceName = inputVal;
            localStorage.setItem('deviceName', deviceName);
            startApp();
        });
    } else {
        startApp();
    }

    function startApp() {
        setupPane.style.display = 'none';
        mainApp.style.display = 'block';
        activeGateDisplay.textContent = `Active at: ${deviceName}`;
        
        // SSE Register
        fetch(`${window.location.origin}/api/scanner/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId, deviceName })
        }).catch(() => {});

        // QR Scanner
        html5QrcodeScanner = new Html5QrcodeScanner('reader', { fps: 12, qrbox: 240 }, false);
        html5QrcodeScanner.render(onScanSuccess, () => {});

        attachUIListeners();
    }

    function attachUIListeners() {
        const scanNextBtn = document.getElementById('scanNextBtn');
        if (scanNextBtn) {
            scanNextBtn.addEventListener('click', () => {
                isProcessing = false;
                document.getElementById('scanResult').classList.add('hidden');
                if (html5QrcodeScanner) html5QrcodeScanner.resume();
            });
        }

        window.manualCheck = () => {
            const val = document.getElementById('manualPassId').value.trim();
            if (val && !isProcessing) {
                document.getElementById('manualPassId').value = '';
                onScanSuccess(val);
            }
        };

        const manualBtn = document.getElementById('manualCheckBtn');
        if (manualBtn) {
            manualBtn.addEventListener('click', window.manualCheck);
        }
    }

    // ─── Scan Logic ───────────────────────────────────────────────────────
    function onScanSuccess(decodedText) {
        if (isProcessing) return;
        isProcessing = true;
        if (html5QrcodeScanner) html5QrcodeScanner.pause(true);

        const resSec = document.getElementById('scanResult');
        const resCard = document.getElementById('resultCard');
        resSec.classList.remove('hidden');
        document.getElementById('scanNextBtn').classList.add('hidden');
        document.getElementById('resultDetails').classList.add('hidden');
        resCard.className = 'result-card';
        document.getElementById('resultIcon').textContent = '⏳';
        document.getElementById('resultStatus').textContent = 'Verifying…';
        document.getElementById('resultMessage').textContent = 'Please wait...';

        let passId = null;
        try {
            const url = new URL(decodedText);
            const parts = url.pathname.split('/');
            const idx = parts.indexOf('verify');
            if (idx !== -1 && parts[idx+1]) passId = parts[idx+1];
        } catch {
            try { passId = JSON.parse(decodedText).passId; } catch { 
                if (/^[0-9a-f-]{36}$/i.test(decodedText.trim()) || decodedText.includes('test-pass-id')) passId = decodedText.trim();
            }
        }

        if (!passId) return showError('Invalid QR Format');
        verifyPass(passId);
    }

    async function verifyPass(passId) {
        try {
            const res = await fetch(`${window.location.origin}/api/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ passId, deviceId, deviceName })
            });
            const data = await res.json();
            const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

            const resCard = document.getElementById('resultCard');
            const resIcon = document.getElementById('resultIcon');
            const resStatus = document.getElementById('resultStatus');
            const resMsg = document.getElementById('resultMessage');

            if (data.success) {
                resCard.className = 'result-card success-bg';
                resIcon.textContent = '✅';
                resStatus.textContent = 'Verified!';
                resMsg.textContent = 'Pass is valid.';
                if (data.details) {
                    document.getElementById('rName').textContent = data.details.name;
                    document.getElementById('rUrn').textContent = data.details.urn;
                    document.getElementById('rEvent').textContent = data.details.event;
                    document.getElementById('resultDetails').classList.remove('hidden');
                    addHistory('✅', data.details.name, data.details.event, now);
                }
            } else if (res.status === 409) {
                resCard.className = 'result-card warning-bg';
                resIcon.textContent = '⚠️';
                resStatus.textContent = 'Already Used';
                resMsg.textContent = data.message;
                addHistory('⚠️', 'Already Used', data.message, now);
            } else {
                resCard.className = 'result-card error-bg';
                resIcon.textContent = '❌';
                resStatus.textContent = 'Access Denied';
                resMsg.textContent = data.message;
                addHistory('❌', 'Denied', data.message, now);
            }
        } catch { showError('Network Error'); }
        finally { document.getElementById('scanNextBtn').classList.remove('hidden'); }
    }

    function showError(msg) {
        document.getElementById('scanResult').classList.remove('hidden');
        document.getElementById('resultCard').className = 'result-card error-bg';
        document.getElementById('resultIcon').textContent = '❌';
        document.getElementById('resultStatus').textContent = 'Error';
        document.getElementById('resultMessage').textContent = msg;
        document.getElementById('scanNextBtn').classList.remove('hidden');
    }

    function addHistory(icon, name, event, time) {
        scanHistory.unshift({ icon, name, event, time });
        const list = document.getElementById('historyList');
        const empty = document.getElementById('historyEmpty');
        if (!list) return;
        empty.style.display = 'none';
        list.querySelectorAll('.history-item').forEach(el => el.remove());
        scanHistory.slice(0, 10).forEach(h => {
            const div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML = `<span class="history-icon">${h.icon}</span><div class="history-text"><strong>${h.name}</strong><span>${h.event}</span></div><span class="history-time">${h.time}</span>`;
            list.appendChild(div);
        });
    }

    window.logoutScanner = () => { localStorage.removeItem('deviceName'); location.reload(); };
    window.clearHistory = () => { scanHistory.length = 0; document.getElementById('historyEmpty').style.display = 'block'; document.querySelectorAll('.history-item').forEach(el => el.remove()); };
});
