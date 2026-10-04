import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Alert, Button, Col, Modal, Nav, Row } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useStore } from '../../store/store';
import { useCurrentUser } from '../../store/session';
import { attendanceForPass, byId } from '../../store/selectors';
import { eventPhase } from '../../utils/eligibility';
import { fmtRange, fmtTime } from '../../utils/format';
import { downloadText, eventToICS } from '../../utils/files';
import { useTitle } from '../../utils/hooks';
import { Countdown, EmptyState, PageHeader, Tag } from '../../components/ui';
import PassCard, { qrValue } from '../../components/PassCard';

function FullscreenPass({ passId, onHide }) {
  const s = useStore();
  const pass = byId(s.passes, passId);
  const ev = pass && byId(s.events, pass.eventId);
  const venue = ev && byId(s.locations, ev.venueId);
  const att = pass && attendanceForPass(s, pass.id);
  const gate = att && byId(s.gates, att.gateId);

  // Keep the screen awake while the pass is shown (where supported).
  useEffect(() => {
    let lock;
    navigator.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    return () => { lock?.release?.().catch(() => {}); };
  }, []);

  if (!pass) return null;
  const size = Math.min(320, window.innerWidth - 80);
  return (
    <Modal show onHide={onHide} centered fullscreen="sm-down" aria-labelledby="fs-title">
      <Modal.Header closeButton><Modal.Title id="fs-title">{ev.title}</Modal.Title></Modal.Header>
      <Modal.Body className="qr-fullscreen">
        {pass.status === 'USED' ? (
          <div className="py-4" role="status">
            <i className="bi bi-check-circle-fill text-success" style={{ fontSize: '4rem' }} aria-hidden="true" />
            <div className="qr-done mt-2">You're checked in</div>
            <p className="text-muted-2">{fmtTime(att?.at)} · {gate?.name}</p>
            <p className="small">Enjoy the event! This pass can't be used again.</p>
          </div>
        ) : pass.status !== 'ACTIVE' ? (
          <Alert variant="danger">This pass is {pass.status.toLowerCase()} and won't open the gate.</Alert>
        ) : (
          <>
            <div className="qr-box"><QRCodeSVG value={qrValue(pass)} size={size} level="M" marginSize={2} title="Your entry QR code" /></div>
            <div className="mono fs-5 mt-2 fw-600">{pass.code}</div>
            <div className="small text-muted-2 mb-3">Code for manual entry if the scanner can't read the QR</div>
            <div className="fw-600">{fmtRange(ev.startsAt, ev.endsAt)}</div>
            <div className="small text-muted-2">{venue?.name}</div>
            <Alert variant="light" className="small mt-3 mb-0 border">
              <i className="bi bi-brightness-high me-1" aria-hidden="true" />Turn your screen brightness up and hold the phone steady about 15 cm from the scanner.
            </Alert>
          </>
        )}
      </Modal.Body>
    </Modal>
  );
}

export default function MyPasses() {
  useTitle('My passes');
  const s = useStore();
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('active');
  const [printId, setPrintId] = useState(null);
  const openId = params.get('open');
  const now = Date.now();

  const mine = s.passes
    .filter((p) => p.userId === user.id)
    .map((p) => ({ p, ev: byId(s.events, p.eventId) }))
    .filter((x) => x.ev);
  const active = mine.filter((x) => x.p.status === 'ACTIVE' && x.ev.endsAt > now).sort((a, b) => a.ev.startsAt - b.ev.startsAt);
  const history = mine.filter((x) => !(x.p.status === 'ACTIVE' && x.ev.endsAt > now)).sort((a, b) => b.ev.startsAt - a.ev.startsAt);
  const list = tab === 'active' ? active : history;

  useEffect(() => {
    if (!printId) return undefined;
    document.body.classList.add('printing');
    const t = setTimeout(() => {
      window.print();
      document.body.classList.remove('printing');
      setPrintId(null);
    }, 150);
    return () => { clearTimeout(t); document.body.classList.remove('printing'); };
  }, [printId]);

  const printPass = printId && byId(s.passes, printId);

  return (
    <>
      <PageHeader title="My passes" subtitle="Show the QR code at the event gate. Each pass works once." actions={<Button as={Link} to="/my/registrations" variant="outline-primary">My registrations</Button>} />
      <Nav variant="pills" activeKey={tab} onSelect={setTab} className="mb-3 gap-1">
        <Nav.Item><Nav.Link eventKey="active">Active ({active.length})</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="history">Used, expired & revoked ({history.length})</Nav.Link></Nav.Item>
      </Nav>
      {!list.length ? (
        <EmptyState icon="qr-code" title={tab === 'active' ? 'No active passes' : 'No past passes'} action={tab === 'active' && <Button as={Link} to="/events">Browse events</Button>}>
          {tab === 'active' ? 'Passes appear here as soon as a registration is confirmed.' : 'Passes you have used or that expired appear here.'}
        </EmptyState>
      ) : (
        <Row className="g-3">
          {list.map(({ p, ev }) => {
            const venue = byId(s.locations, ev.venueId);
            const phase = eventPhase(ev);
            return (
              <Col xl={6} key={p.id}>
                <PassCard
                  pass={p}
                  actions={
                    <>
                      {p.status === 'ACTIVE' && <Button size="sm" onClick={() => setParams({ open: p.id })}><i className="bi bi-arrows-fullscreen me-1" />Show full screen</Button>}
                      <Button size="sm" variant="light" onClick={() => setPrintId(p.id)}><i className="bi bi-file-earmark-pdf me-1" />Download PDF</Button>
                      {p.status === 'ACTIVE' && <Button size="sm" variant="light" onClick={() => downloadText(`${ev.title}.ics`, eventToICS(ev, venue?.name), 'text/calendar')}><i className="bi bi-calendar-plus me-1" />Calendar</Button>}
                      <Button size="sm" variant="light" as={Link} to={`/campus?loc=${venue?.id}`}><i className="bi bi-map me-1" />Venue</Button>
                      <span className="ms-auto small-2 align-self-center">
                        {p.status === 'ACTIVE' && (phase === 'LIVE' ? <Tag tone="danger" icon="broadcast">Gates open</Tag> : <Countdown to={ev.startsAt} />)}
                      </span>
                    </>
                  }
                />
              </Col>
            );
          })}
        </Row>
      )}
      {openId && <FullscreenPass passId={openId} onHide={() => setParams({})} />}
      {printPass && createPortal(<div className="print-area"><PassCard pass={printPass} qrSize={180} /></div>, document.body)}
    </>
  );
}
