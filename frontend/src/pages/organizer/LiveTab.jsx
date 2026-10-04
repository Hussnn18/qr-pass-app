import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Col, Form, ListGroup, Modal, ProgressBar, Row } from 'react-bootstrap';
import { SCAN_RESULTS } from '../../data/constants';
import { useStore } from '../../store/store';
import { byId, eventStats, gatesForEvent } from '../../store/selectors';
import { overrideCheckIn, simulateGateTraffic } from '../../store/actions';
import { eventPhase } from '../../utils/eligibility';
import { fmtTime, fromNow, pct } from '../../utils/format';
import { useNow } from '../../utils/hooks';
import { Avatar, EmptyState, Panel, Tag } from '../../components/ui';
import { toast } from '../../components/feedback';

function ManualCheckIn({ ev, show, onHide }) {
  const s = useStore();
  const gates = gatesForEvent(s, ev);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(null);
  const [gateId, setGateId] = useState(gates[0]?.id || '');
  const [reason, setReason] = useState('Phone battery dead — verified college ID');
  const candidates = s.registrations
    .filter((r) => r.eventId === ev.id && r.status === 'APPROVED' && !s.attendance.some((a) => a.registrationId === r.id))
    .map((r) => ({ r, u: byId(s.users, r.userId) }))
    .filter(({ u }) => q.length >= 2 && `${u.name} ${u.urn || ''}`.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 6);
  const submit = () => {
    const r = overrideCheckIn(pick.r.id, gateId, reason);
    toast.result(r);
    if (r.ok) { setPick(null); setQ(''); onHide(); }
  };
  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton><Modal.Title>Manual check-in</Modal.Title></Modal.Header>
      <Modal.Body>
        <p className="small text-muted-2">For confirmed participants who can't show their QR. Every manual check-in is recorded in the audit log with your reason.</p>
        <Form.Group controlId="mc-q" className="mb-2"><Form.Label>Find participant</Form.Label>
          <Form.Control value={q} onChange={(e) => { setQ(e.target.value); setPick(null); }} placeholder="Type a name or URN" autoFocus />
        </Form.Group>
        {q.length >= 2 && (
          <ListGroup className="mb-3">
            {candidates.map((c) => (
              <ListGroup.Item key={c.r.id} action active={pick?.r.id === c.r.id} onClick={() => setPick(c)} className="d-flex gap-2 align-items-center">
                <Avatar user={c.u} size={28} /><span><span className="fw-600">{c.u.name}</span> <span className="small mono">{c.u.urn || c.u.email}</span></span>
              </ListGroup.Item>
            ))}
            {!candidates.length && <ListGroup.Item className="small text-muted-2">No confirmed, not-yet-checked-in participant matches.</ListGroup.Item>}
          </ListGroup>
        )}
        <Row className="g-2">
          <Col sm={5}><Form.Group controlId="mc-gate"><Form.Label>Gate</Form.Label><Form.Select value={gateId} onChange={(e) => setGateId(e.target.value)}>{gates.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Form.Select></Form.Group></Col>
          <Col sm={7}><Form.Group controlId="mc-reason"><Form.Label>Reason</Form.Label><Form.Control value={reason} onChange={(e) => setReason(e.target.value)} /></Form.Group></Col>
        </Row>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="light" onClick={onHide}>Cancel</Button>
        <Button onClick={submit} disabled={!pick || !reason.trim() || !gateId}>Check in</Button>
      </Modal.Footer>
    </Modal>
  );
}

export default function LiveTab({ ev }) {
  const s = useStore();
  useNow(15000);
  const st = eventStats(s, ev.id);
  const gates = gatesForEvent(s, ev);
  const phase = eventPhase(ev);
  const [sim, setSim] = useState(false);
  const [manual, setManual] = useState(false);
  const seen = useRef(new Set());
  const logs = useMemo(() => s.scanLogs.filter((l) => l.eventId === ev.id).sort((a, b) => b.at - a.at).slice(0, 30), [s.scanLogs, ev.id]);
  const fresh = new Set(logs.filter((l) => !seen.current.has(l.id)).map((l) => l.id));
  useEffect(() => { logs.forEach((l) => seen.current.add(l.id)); }, [logs]);
  const windowOpen = Date.now() >= ev.startsAt - 36e5 && Date.now() <= ev.endsAt && ['PUBLISHED', 'CLOSED'].includes(ev.status);

  useEffect(() => {
    if (!sim) return undefined;
    const t = setInterval(() => {
      const r = simulateGateTraffic(ev.id);
      if (!r.ok) { setSim(false); toast.info(r.message); }
    }, 1300);
    return () => clearInterval(t);
  }, [sim, ev.id]);

  const rejected = logs.filter((l) => l.result !== 'SUCCESS').length;
  const lastHour = s.attendance.filter((a) => a.eventId === ev.id && a.at > Date.now() - 36e5).length;

  return (
    <>
      {!windowOpen && (
        <Alert variant="secondary" className="small">
          <i className="bi bi-info-circle me-2" />
          {phase === 'ENDED' ? 'This event has ended — the numbers below are final.' : ev.status === 'CANCELLED' ? 'This event was cancelled.' : `Gates open at ${fmtTime(ev.startsAt - 36e5)} on the event day. Live check-ins will stream in here.`}
        </Alert>
      )}
      <Row className="g-3 mb-3">
        <Col md={4}>
          <Panel className="h-100">
            <div className="text-center">
              <div className="small text-muted-2 fw-600 text-uppercase">Checked in</div>
              <div className="big-counter my-1" aria-live="polite">{st.attended}</div>
              <div className="small text-muted-2">of {st.approved} confirmed · {pct(st.attended, st.approved)}%</div>
              <ProgressBar now={pct(st.attended, st.approved)} className="mt-2" style={{ height: 10 }} aria-label="Share checked in" />
              <div className="d-flex justify-content-around mt-3 small">
                <span><strong>{lastHour}</strong><br /><span className="text-muted-2">last hour</span></span>
                <span><strong>{st.approved - st.attended}</strong><br /><span className="text-muted-2">still to arrive</span></span>
                <span><strong className="text-danger">{rejected}</strong><br /><span className="text-muted-2">rejected scans</span></span>
              </div>
            </div>
          </Panel>
        </Col>
        <Col md={8}>
          <Panel title="By gate" icon="door-open" className="h-100" actions={
            <div className="d-flex gap-2">
              <Button size="sm" variant="light" onClick={() => setManual(true)} disabled={!windowOpen}><i className="bi bi-person-check me-1" />Manual check-in</Button>
              <Button size="sm" variant={sim ? 'danger' : 'brand'} onClick={() => setSim((x) => !x)} disabled={!windowOpen} aria-pressed={sim}>
                <i className={`bi bi-${sim ? 'stop-fill' : 'play-fill'} me-1`} />{sim ? 'Stop simulation' : 'Simulate gate traffic'}
              </Button>
            </div>
          }>
            {!gates.length ? <p className="small text-muted-2 mb-0">No gates configured.</p> : gates.map((g) => {
              const n = s.attendance.filter((a) => a.eventId === ev.id && a.gateId === g.id).length;
              const staff = s.assignments.filter((a) => a.eventId === ev.id && a.gateId === g.id).map((a) => byId(s.users, a.userId)?.name);
              const last = s.scanLogs.filter((l) => l.eventId === ev.id && l.gateId === g.id).sort((a, b) => b.at - a.at)[0];
              return (
                <div key={g.id} className="mb-3">
                  <div className="d-flex justify-content-between small">
                    <span className="fw-600">{g.name} <span className="text-muted-2 fw-normal">· {staff.join(', ') || 'no staff'}</span></span>
                    <span><strong>{n}</strong> in{last && <span className="text-muted-2"> · last scan {fromNow(last.at)}</span>}</span>
                  </div>
                  <ProgressBar now={pct(n, Math.max(st.attended, 1))} style={{ height: 8 }} aria-label={`${g.name} share`} />
                </div>
              );
            })}
            {sim && <div className="small text-danger"><span className="live-chip me-1">●</span>Simulating scans from assigned gate staff every ~1.3 s (demo only)</div>}
          </Panel>
        </Col>
      </Row>
      <Panel title="Live scan feed" icon="activity" flush actions={<span className="small text-muted-2">Newest first · updates instantly</span>}>
        {!logs.length ? <EmptyState icon="upc-scan" title="No scans yet">Scans from every gate appear here the moment they happen.</EmptyState> : (
          <ul className="feed" aria-live="polite" aria-relevant="additions">
            {logs.map((l) => {
              const meta = SCAN_RESULTS[l.result];
              const u = l.participantId && byId(s.users, l.participantId);
              return (
                <li key={l.id} className={fresh.has(l.id) ? 'fresh' : ''}>
                  <span className={`feed-icon tone-${meta.tone}`}><i className={`bi bi-${meta.icon}`} aria-hidden="true" /></span>
                  <div className="flex-grow-1 min-w-0">
                    <div className="small"><strong>{meta.title}</strong>{u && <> · {u.name} <span className="mono text-muted-2">{u.urn || 'guest'}</span></>}</div>
                    <div className="small-2 text-muted-2">{byId(s.gates, l.gateId)?.name} · {byId(s.users, l.by)?.name || 'scanner'}{l.method === 'OVERRIDE' && ' · manual override'}{l.method === 'MANUAL' && ' · typed code'}</div>
                  </div>
                  <span className="small-2 text-muted-2 text-nowrap">{fmtTime(l.at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Tag tone="secondary" icon="info-circle">In production this feed is pushed from the server (Server-Sent Events).</Tag>
      {manual && <ManualCheckIn ev={ev} show={manual} onHide={() => setManual(false)} />}
    </>
  );
}
