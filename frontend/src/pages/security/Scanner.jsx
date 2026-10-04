import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Col, Form, InputGroup, Row } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router-dom';
import { SCAN_RESULTS } from '../../data/constants';
import { useStore } from '../../store/store';
import { useCurrentUser } from '../../store/session';
import { scanOptions } from '../../store/selectors';
import { demoCode, verifyScan } from '../../store/actions';
import { eventPhase } from '../../utils/eligibility';
import { fmtTime } from '../../utils/format';
import { usePersistentState, useTitle } from '../../utils/hooks';
import { Avatar, EmptyState, Panel, Tag } from '../../components/ui';
import { toast } from '../../components/feedback';
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
  const nextRef = useRef(null);
  useEffect(() => {
    nextRef.current?.focus();
    if (res.tone !== 'success') return undefined;
    const t = setTimeout(onNext, 2600);
    return () => clearTimeout(t);
  }, [res, onNext]);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' || e.key === 'Enter') onNext(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onNext]);
  const p = res.participant;
  return (
    <div className={`scan-result res-${res.tone}`} role="alertdialog" aria-modal="true" aria-labelledby="res-title" aria-describedby="res-msg">
      <div className="scan-result-card">
        <i className={`bi bi-${res.icon} scan-result-icon`} aria-hidden="true" />
        <div id="res-title" className="scan-result-title">{res.title}</div>
        <p id="res-msg" className="mb-0">{res.message}</p>
        {p && (
          <div className="scan-person">
            <Avatar user={{ name: p.name, photo: p.photo }} size={64} />
            <div className="min-w-0">
              <div className="fw-bold">{p.name}</div>
              <div className="mono small">{p.idLabel}</div>
              <div className="small text-muted-2">{p.sub}</div>
              {res.passEvent && res.result === 'WRONG_EVENT' &&<div className="small-2 text-muted-2">Pass for: {res.passEvent}</div>}
            </div>
          </div>
        )}
        {res.result === 'SUCCESS' && <p className="small text-muted-2 mb-2">Check the face matches the photo before allowing entry.</p>}
        <Button ref={nextRef} size="lg" className="w-100 mt-2" variant={res.tone === 'success' ? 'success' : 'dark'} onClick={onNext}>Scan next <span className="small opacity-75">(Enter)</span></Button>
        {res.tone === 'success' && <div className="scan-autoclose" aria-hidden="true"><span /></div>}
      </div>
    </div>
  );
}

export default function Scanner() {
  useTitle('Scanner');
  const s = useStore();
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const options = scanOptions(s, user);
  const [sound, setSound] = usePersistentState('scems_scan_sound', true);
  const [camera, setCamera] = useState(false);
  const [camError, setCamError] = useState('');
  const [result, setResult] = useState(null);
  const [manual, setManual] = useState('');
  const [history, setHistory] = useState([]);
  const last = useRef({ code: null, at: 0 });
  const deviceId = useRef(`web_${user.id}`).current;

  const live = options.find((o) => eventPhase(o.event) === 'LIVE') || options[0];
  const eventId = params.get('event') || live?.event.id;
  const gateId = params.get('gate') || options.find((o) => o.event.id === eventId)?.gate.id;
  const current = options.find((o) => o.event.id === eventId && o.gate.id === gateId);

  const handle = useCallback((code, method = 'QR') => {
    if (result) return;
    if (method === 'QR' && last.current.code === code && Date.now() - last.current.at < 4000) return;
    last.current = { code, at: Date.now() };
    const r = verifyScan({ code, eventId, gateId, method, deviceId });
    if (sound) beep(r.tone);
    navigator.vibrate?.(r.tone === 'success' ? 80 : [120, 80, 120]);
    setResult(r);
    setHistory((h) => [{ ...r, key: Math.random() }, ...h].slice(0, 12));
  }, [result, eventId, gateId, deviceId, sound]);

  const next = useCallback(() => setResult(null), []);

  if (!options.length) {
    return (
      <EmptyState icon="shield-x" title="No gates to scan right now" action={<Button as={Link} to={user.role === 'SECURITY' ? '/scan/assignments' : '/manage/events'}>See {user.role === 'SECURITY' ? 'assignments' : 'events'}</Button>}>
        {user.role === 'SECURITY' ? "You don't have an active gate assignment. Ask the event organizer to assign you." : 'None of your events are published and upcoming with entry gates.'}
      </EmptyState>
    );
  }
  if (!current) {
    return <Alert variant="warning">That gate isn't available to you. <Button variant="link" onClick={() => setParams({})}>Choose again</Button></Alert>;
  }
  const ev = current.event;
  const opensAt = ev.startsAt - 36e5;
  const windowOpen = Date.now() >= opensAt;
  const gateCount = s.attendance.filter((a) => a.eventId === ev.id && a.gateId === gateId).length;
  const total = s.attendance.filter((a) => a.eventId === ev.id).length;
  const approved = s.registrations.filter((r) => r.eventId === ev.id && r.status === 'APPROVED').length;
  const simulate = (kind) => {
    const r = demoCode(ev.id, kind);
    if (!r.ok) return toast.info(r.message);
    handle(r.code, 'QR');
  };

  return (
    <>
      <h1 className="visually-hidden">Gate scanner</h1>
      <div className="scan-context">
        <div className="min-w-0">
          <div className="label">Scanning for</div>
          <div className="value text-truncate">{ev.title}</div>
        </div>
        <div>
          <div className="label">Gate</div>
          <div className="value">{current.gate.name}</div>
        </div>
        <div className="text-end">
          <div className="label">This gate / total</div>
          <div className="value" aria-live="polite">{gateCount} / {total} <span className="fw-normal opacity-75">of {approved}</span></div>
        </div>
        <Form.Select size="sm" style={{ maxWidth: 300 }} value={`${eventId}|${gateId}`} onChange={(e) => { const [ev2, g2] = e.target.value.split('|'); setParams({ event: ev2, gate: g2 }); setHistory([]); }} aria-label="Change event or gate">
          {options.map((o) => <option key={`${o.event.id}|${o.gate.id}`} value={`${o.event.id}|${o.gate.id}`}>{o.event.title} — {o.gate.name}</option>)}
        </Form.Select>
      </div>

      {!windowOpen && <Alert variant="warning" className="small"><i className="bi bi-clock me-2" />Entry opens at {fmtTime(opensAt)}. Scans before then are rejected as "outside entry time".</Alert>}

      <Row className="g-3">
        <Col lg={7} className="section-gap">
          <Panel title="Camera" icon="camera-video" actions={
            <div className="d-flex gap-2">
              <Button size="sm" variant="light" onClick={() => setSound((x) => !x)} aria-pressed={sound} aria-label={sound ? 'Mute sounds' : 'Unmute sounds'}><i className={`bi bi-volume-${sound ? 'up' : 'mute'}`} /></Button>
              <Button size="sm" variant={camera ? 'outline-danger' : 'primary'} onClick={() => { setCamError(''); setCamera((x) => !x); }}>
                <i className={`bi bi-camera-video${camera ? '-off' : ''} me-1`} />{camera ? 'Stop camera' : 'Start camera'}
              </Button>
            </div>
          }>
            <div className="scanner-viewport">
              {camera ? <QrCamera active={camera} paused={!!result} onCode={(c) => handle(c, 'QR')} onError={(e) => { setCamera(false); setCamError(String(e?.message || e)); }} /> : (
                <div className="scanner-placeholder">
                  <i className="bi bi-qr-code-scan" aria-hidden="true" />
                  <div className="fw-600">Camera is off</div>
                  <div className="small opacity-75">Start the camera, or use the demo buttons and manual entry below.</div>
                </div>
              )}
            </div>
            {camError && <Alert variant="warning" className="small mt-2 mb-0"><i className="bi bi-camera-video-off me-1" />Couldn't start the camera ({camError}). Phones need HTTPS or localhost for camera access — use manual entry meanwhile.</Alert>}
            <Form className="mt-3" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { handle(manual.trim(), 'MANUAL'); setManual(''); } }}>
              <Form.Label htmlFor="manual-code" className="small">Manual entry — pass code (GN-XXXX-XXXX) or student URN</Form.Label>
              <InputGroup>
                <InputGroup.Text><i className="bi bi-keyboard" aria-hidden="true" /></InputGroup.Text>
                <Form.Control id="manual-code" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="GN-7F3K-92QA or 2302511" autoComplete="off" className="mono" />
                <Button type="submit" disabled={!manual.trim()}>Verify</Button>
              </InputGroup>
              <Form.Text>Manual entries are recorded in the audit log.</Form.Text>
            </Form>
          </Panel>

          <Panel title="Demo — simulate a scan" icon="magic">
            <p className="small text-muted-2">Each button scans a real pass from the mock database, so the server-side checks run exactly as they would for a camera scan.</p>
            <div className="sim-grid">
              <Button variant="outline-success" onClick={() => simulate('valid')}><i className="bi bi-check-circle me-1" />Valid pass</Button>
              <Button variant="outline-warning" onClick={() => simulate('used')}><i className="bi bi-exclamation-triangle me-1" />Already used</Button>
              <Button variant="outline-danger" onClick={() => simulate('wrong')}><i className="bi bi-x-octagon me-1" />Other event</Button>
              <Button variant="outline-danger" onClick={() => simulate('revoked')}><i className="bi bi-slash-circle me-1" />Revoked pass</Button>
              <Button variant="outline-danger" onClick={() => simulate('invalid')}><i className="bi bi-question-octagon me-1" />Fake token</Button>
              <Button variant="outline-secondary" onClick={() => simulate('foreign')}><i className="bi bi-qr-code me-1" />Random QR</Button>
            </div>
          </Panel>
        </Col>
        <Col lg={5}>
          <Panel title="This session" icon="clock-history" flush actions={<Link to={`/scan/history?event=${ev.id}`} className="small">Full history</Link>}>
            {!history.length ? <EmptyState icon="upc-scan" title="No scans yet">Results appear here as you scan.</EmptyState> : (
              <ul className="feed">
                {history.map((h) => (
                  <li key={h.key}>
                    <span className={`feed-icon tone-${h.tone}`}><i className={`bi bi-${h.icon}`} aria-hidden="true" /></span>
                    <div className="flex-grow-1 min-w-0">
                      <div className="small fw-600">{h.title}{h.participant && <> · {h.participant.name}</>}</div>
                      <div className="small-2 text-muted-2 text-truncate">{h.message}</div>
                    </div>
                    <span className="small-2 text-muted-2">{fmtTime(h.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Result colours" icon="palette" className="mt-3">
            <div className="d-flex flex-wrap gap-2">
              {['SUCCESS', 'ALREADY_USED', 'OUTSIDE_WINDOW', 'WRONG_EVENT', 'REVOKED', 'INVALID_TOKEN'].map((k) => (
                <Tag key={k} tone={SCAN_RESULTS[k].tone} icon={SCAN_RESULTS[k].icon}>{SCAN_RESULTS[k].title}</Tag>
              ))}
            </div>
          </Panel>
        </Col>
      </Row>
      {result && <ResultOverlay res={result} onNext={next} />}
      <span className="visually-hidden" aria-live="assertive">{result ? `${result.title}. ${result.message}` : ''}</span>
    </>
  );
}
