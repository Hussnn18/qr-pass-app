import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Col, Form, InputGroup, Row } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useApi } from '../../api/useApi';
import { SCAN_RESULTS } from '../../data/constants';
import { useCurrentUser } from '../../auth/AuthContext';
import { fmtTime } from '../../utils/format';
import { usePersistentState, useTitle } from '../../utils/hooks';
import { Avatar, EmptyState, Loading, Panel, Tag } from '../../components/ui';
import QrCamera from '../../components/QrCamera';

let audioCtx;
function beep(tone) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const notes = tone === 'success' ? [[880, 0, 0.11], [1320, 0.12, 0.13]] : tone === 'warning' ? [[540, 0, 0.16], [540, 0.22, 0.16]] : [[200, 0, 0.4]];
    notes.forEach(([f, at, dur]) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = tone === 'danger' ? 'square' : 'sine';
      o.frequency.value = f;
      const t = audioCtx.currentTime + at;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
  } catch { /* audio not available */ }
}

function ResultOverlay({ res, onNext }) {
  const meta = SCAN_RESULTS[res.result] || SCAN_RESULTS.INVALID_TOKEN;
  const nextRef = useRef(null);
  useEffect(() => {
    nextRef.current?.focus();
    if (meta.tone !== 'success') return undefined;
    const t = setTimeout(onNext, 2600);
    return () => clearTimeout(t);
  }, [res, onNext, meta.tone]);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' || e.key === 'Enter') onNext(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onNext]);
  const p = res.holder;
  return (
    <div className={`scan-result res-${meta.tone}`} role="alertdialog" aria-modal="true" aria-labelledby="res-title" aria-describedby="res-msg">
      <div className="scan-result-card">
        <i className={`bi bi-${meta.icon} scan-result-icon`} aria-hidden="true" />
        <div id="res-title" className="scan-result-title">{meta.title}</div>
        <p id="res-msg" className="mb-0">{res.message}</p>
        {p && (
          <div className="scan-person">
            <Avatar user={p} size={64} />
            <div className="min-w-0">
              <div className="fw-bold">{p.name}</div>
              <div className="mono small">{p.idLabel}</div>
              <div className="small text-muted-2">{p.sub}</div>
            </div>
          </div>
        )}
        {res.result === 'SUCCESS' && <p className="small text-muted-2 mb-2">Check the face matches the photo before allowing entry.</p>}
        <Button ref={nextRef} size="lg" className="w-100 mt-2" variant={meta.tone === 'success' ? 'success' : 'dark'} onClick={onNext}>Scan next <span className="small opacity-75">(Enter)</span></Button>
        {meta.tone === 'success' && <div className="scan-autoclose" aria-hidden="true"><span /></div>}
      </div>
    </div>
  );
}

/** Gate scanner (objective 3). Every decision is made by POST /scan/verify on the server. */
export default function Scanner() {
  useTitle('Scanner');
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const opts = useApi('/scan/assignments', { poll: 15000 });
  const [sound, setSound] = usePersistentState('scems_scan_sound', true);
  const [camera, setCamera] = useState(false);
  const [camError, setCamError] = useState('');
  const [result, setResult] = useState(null);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const last = useRef({ code: null, at: 0 });
  const deviceId = useRef(`web-${user.id}-${Math.random().toString(36).slice(2, 7)}`).current;

  const options = opts.data || [];
  const now = Date.now();
  const live = options.find((o) => now >= o.event.startsAt - 36e5 && now <= o.event.endsAt) || options[0];
  const eventId = Number(params.get('event')) || live?.event.id;
  const gateId = Number(params.get('gate')) || options.find((o) => o.event.id === eventId)?.gateId;
  const current = options.find((o) => o.event.id === eventId && o.gateId === gateId);

  const verify = useCallback(async (payload) => {
    if (result || busy || !current) return;
    setBusy(true);
    try {
      const r = await api('/scan/verify', { method: 'POST', body: { eventId: current.event.id, gateId: current.gateId, deviceId, ...payload } });
      const tone = (SCAN_RESULTS[r.result] || {}).tone;
      if (sound) beep(tone);
      navigator.vibrate?.(tone === 'success' ? 80 : [120, 80, 120]);
      setResult(r);
      setHistory((h) => [{ ...r, key: `${r.at}-${Math.random()}` }, ...h].slice(0, 12));
      opts.reload();
    } catch (e) {
      setResult({ result: 'INVALID_TOKEN', message: e.message, at: Date.now() });
    } finally {
      setBusy(false);
    }
  }, [result, busy, current, deviceId, sound, opts]);

  const onQr = useCallback((text) => {
    if (last.current.code === text && Date.now() - last.current.at < 4000) return;
    last.current = { code: text, at: Date.now() };
    verify({ qr: text });
  }, [verify]);
  const next = useCallback(() => setResult(null), []);

  if (!opts.data) return opts.error ? <Alert variant="danger">{opts.error.message}</Alert> : <Loading />;
  if (!options.length) {
    return (
      <EmptyState icon="shield-x" title="No gates to scan right now" action={<Button as={Link} to={user.role === 'SECURITY' ? '/scan/assignments' : '/manage/events'}>See {user.role === 'SECURITY' ? 'assignments' : 'events'}</Button>}>
        {user.role === 'SECURITY' ? "You don't have an upcoming gate assignment. Ask the event's organizer to assign you." : 'None of your events are published with entry gates.'}
      </EmptyState>
    );
  }
  if (!current) return <Alert variant="warning">That gate isn't available to you. <Button variant="link" onClick={() => setParams({})}>Choose again</Button></Alert>;
  const ev = current.event;
  const opensAt = ev.startsAt - 36e5;

  return (
    <>
      <h1 className="visually-hidden">Gate scanner</h1>
      <div className="scan-context">
        <div className="min-w-0"><div className="label">Scanning for</div><div className="value text-truncate">{ev.title}</div></div>
        <div><div className="label">Gate</div><div className="value">{current.gateName}</div></div>
        <div className="text-end"><div className="label">This gate / all gates</div><div className="value" aria-live="polite">{current.enteredAtGate} / {current.enteredTotal} <span className="fw-normal opacity-75">of {current.confirmed}</span></div></div>
        <Form.Select size="sm" style={{ maxWidth: 300 }} value={`${eventId}|${gateId}`} aria-label="Change event or gate"
          onChange={(e) => { const [a, b] = e.target.value.split('|'); setParams({ event: a, gate: b }); setHistory([]); }}>
          {options.map((o) => <option key={`${o.event.id}|${o.gateId}`} value={`${o.event.id}|${o.gateId}`}>{o.event.title} — {o.gateName}</option>)}
        </Form.Select>
      </div>

      {now < opensAt && <Alert variant="warning" className="small"><i className="bi bi-clock me-2" />Entry opens at {fmtTime(opensAt)}. Scans before then are refused as “outside entry time”.</Alert>}

      <Row className="g-3">
        <Col lg={7}>
          <Panel title="Camera" icon="camera-video" actions={
            <div className="d-flex gap-2">
              <Button size="sm" variant="light" onClick={() => setSound((x) => !x)} aria-pressed={sound} aria-label={sound ? 'Mute sounds' : 'Unmute sounds'}><i className={`bi bi-volume-${sound ? 'up' : 'mute'}`} /></Button>
              <Button size="sm" variant={camera ? 'outline-danger' : 'primary'} onClick={() => { setCamError(''); setCamera((x) => !x); }}>
                <i className={`bi bi-camera-video${camera ? '-off' : ''} me-1`} />{camera ? 'Stop camera' : 'Start camera'}
              </Button>
            </div>
          }>
            <div className="scanner-viewport">
              {camera ? <QrCamera active={camera} paused={!!result || busy} onCode={onQr} onError={(e) => { setCamera(false); setCamError(String(e?.message || e)); }} /> : (
                <div className="scanner-placeholder">
                  <i className="bi bi-qr-code-scan" aria-hidden="true" />
                  <div className="fw-600">Camera is off</div>
                  <div className="small opacity-75">Start the camera and hold the student's pass inside the frame, or type the pass code below.</div>
                </div>
              )}
            </div>
            {camError && <Alert variant="warning" className="small mt-2 mb-0"><i className="bi bi-camera-video-off me-1" />Couldn't start the camera ({camError}). Phones need HTTPS or localhost for camera access — use manual entry meanwhile.</Alert>}
            <Form className="mt-3" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { verify({ code: manual.trim() }); setManual(''); } }}>
              <Form.Label htmlFor="manual-code" className="small">Manual entry — pass code (GN-XXXX-XXXX) or student URN</Form.Label>
              <InputGroup>
                <InputGroup.Text><i className="bi bi-keyboard" aria-hidden="true" /></InputGroup.Text>
                <Form.Control id="manual-code" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="GN-7F3K-92QA or 2302511" autoComplete="off" className="mono" />
                <Button type="submit" disabled={!manual.trim() || busy}>Verify</Button>
              </InputGroup>
              <Form.Text>Manual entries are recorded in the audit log.</Form.Text>
            </Form>
          </Panel>
        </Col>
        <Col lg={5}>
          <Panel title="This session" icon="clock-history" flush actions={<Link to={`/scan/history?eventId=${ev.id}`} className="small">Full history</Link>}>
            {!history.length ? <EmptyState icon="upc-scan" title="No scans yet">Results appear here as you scan.</EmptyState> : (
              <ul className="feed">
                {history.map((h) => {
                  const meta = SCAN_RESULTS[h.result] || SCAN_RESULTS.INVALID_TOKEN;
                  return (
                    <li key={h.key}>
                      <span className={`feed-icon tone-${meta.tone}`}><i className={`bi bi-${meta.icon}`} aria-hidden="true" /></span>
                      <div className="flex-grow-1 min-w-0">
                        <div className="small fw-600">{meta.title}{h.holder && <> · {h.holder.name}</>}</div>
                        <div className="small-2 text-muted-2 text-truncate">{h.message}</div>
                      </div>
                      <span className="small-2 text-muted-2">{fmtTime(h.at)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
          <Panel title="Result colours" icon="palette" className="mt-3">
            <div className="d-flex flex-wrap gap-2">
              {['SUCCESS', 'ALREADY_USED', 'OUTSIDE_WINDOW', 'WRONG_EVENT', 'REVOKED', 'INVALID_TOKEN'].map((k) => <Tag key={k} tone={SCAN_RESULTS[k].tone} icon={SCAN_RESULTS[k].icon}>{SCAN_RESULTS[k].title}</Tag>)}
            </div>
          </Panel>
        </Col>
      </Row>
      {result && <ResultOverlay res={result} onNext={next} />}
      <span className="visually-hidden" aria-live="assertive">{result ? `${(SCAN_RESULTS[result.result] || {}).title}. ${result.message}` : ''}</span>
    </>
  );
}
