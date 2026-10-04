import { useEffect, useState } from 'react';
import { Alert, Button, Col, Modal, Nav, Row } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { download } from '../../api/client';
import { useApi } from '../../api/useApi';
import { fmtRange, fmtTime } from '../../utils/format';
import { downloadText, eventToICS } from '../../utils/files';
import { useTitle } from '../../utils/hooks';
import { Countdown, EmptyState, ErrorState, Loading, PageHeader, Tag } from '../../components/ui';
import { attempt } from '../../components/feedback';
import PassCard from '../../components/PassCard';

function FullscreenPass({ pass, onHide }) {
  // Keep the screen awake while the pass is on screen (where supported).
  useEffect(() => {
    let lock;
    navigator.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    return () => { lock?.release?.().catch(() => {}); };
  }, []);
  const size = Math.min(320, window.innerWidth - 80);
  const ev = pass.event;
  return (
    <Modal show onHide={onHide} centered fullscreen="sm-down" aria-labelledby="fs-title">
      <Modal.Header closeButton><Modal.Title id="fs-title">{ev.title}</Modal.Title></Modal.Header>
      <Modal.Body className="qr-fullscreen">
        {pass.status === 'USED' ? (
          <div className="py-4" role="status">
            <i className="bi bi-check-circle-fill text-success" style={{ fontSize: '4rem' }} aria-hidden="true" />
            <div className="qr-done mt-2">You're in</div>
            <p className="text-muted-2">{pass.entry && `${fmtTime(pass.entry.at)} · ${pass.entry.gateName}`}</p>
            <p className="small">Enjoy the event! This pass can't be used again.</p>
          </div>
        ) : pass.status !== 'ACTIVE' ? (
          <Alert variant="danger">This pass is {pass.status.toLowerCase()} and won't open the gate.</Alert>
        ) : (
          <>
            <div className="qr-box"><QRCodeSVG value={pass.qr} size={size} level="M" marginSize={2} title="Your entry QR code" /></div>
            <div className="mono fs-5 mt-2 fw-600">{pass.code}</div>
            <div className="small text-muted-2 mb-3">Code for manual entry if the scanner can't read the QR</div>
            <div className="fw-600">{fmtRange(ev.startsAt, ev.endsAt)}</div>
            <div className="small text-muted-2">{ev.venueName}{ev.gates.length > 0 && ` · ${ev.gates.join(', ')}`}</div>
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
  const [params, setParams] = useSearchParams();
  const openId = params.get('open');
  // While a pass is open full-screen, refresh every few seconds so it flips to "You're in" after the scan.
  const res = useApi('/me/passes', { poll: openId ? 4000 : 0 });
  const [tab, setTab] = useState('active');
  const now = Date.now();
  const all = res.data || [];
  const active = all.filter((p) => p.status === 'ACTIVE' && p.event.endsAt > now).sort((a, b) => a.event.startsAt - b.event.startsAt);
  const history = all.filter((p) => !(p.status === 'ACTIVE' && p.event.endsAt > now)).sort((a, b) => b.event.startsAt - a.event.startsAt);
  const list = tab === 'active' ? active : history;
  const opened = all.find((p) => String(p.id) === openId);

  return (
    <>
      <PageHeader title="My passes" subtitle="Show the QR code at the event gate. Each pass works once." actions={<Button as={Link} to="/my/registrations" variant="outline-primary">My registrations</Button>} />
      <Nav variant="pills" activeKey={tab} onSelect={setTab} className="mb-3 gap-1">
        <Nav.Item><Nav.Link eventKey="active">Valid ({active.length})</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="history">Used, expired &amp; revoked ({history.length})</Nav.Link></Nav.Item>
      </Nav>
      {res.error && !res.data ? <ErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <Loading /> : !list.length ? (
        <EmptyState icon="qr-code" title={tab === 'active' ? 'No valid passes' : 'No past passes'} action={tab === 'active' && <Button as={Link} to="/events">Browse events</Button>}>
          {tab === 'active' ? 'Passes appear here as soon as a registration is confirmed.' : 'Passes you have used or that expired appear here.'}
        </EmptyState>
      ) : (
        <Row className="g-3">
          {list.map((p) => (
            <Col xl={6} key={p.id}>
              <PassCard
                pass={p}
                actions={
                  <>
                    {p.status === 'ACTIVE' && <Button size="sm" onClick={() => setParams({ open: p.id })}><i className="bi bi-arrows-fullscreen me-1" />Show full screen</Button>}
                    {p.status === 'ACTIVE' && <Button size="sm" variant="light" onClick={() => attempt(() => download(`/passes/${p.id}/pdf`, 'entry-pass.pdf'))}><i className="bi bi-file-earmark-pdf me-1" />Download PDF</Button>}
                    {p.status === 'ACTIVE' && <Button size="sm" variant="light" onClick={() => downloadText(`${p.event.title}.ics`, eventToICS(p.event, p.event.venueName), 'text/calendar')}><i className="bi bi-calendar-plus me-1" />Calendar</Button>}
                    <Button size="sm" variant="light" as={Link} to={`/events/${p.event.id}`}><i className="bi bi-info-circle me-1" />Event</Button>
                    <span className="ms-auto small-2 align-self-center">
                      {p.status === 'ACTIVE' && (p.event.startsAt - 36e5 <= now ? <Tag tone="danger" icon="broadcast">Gates open</Tag> : <Countdown to={p.event.startsAt} />)}
                    </span>
                  </>
                }
              />
            </Col>
          ))}
        </Row>
      )}
      {opened && <FullscreenPass pass={opened} onHide={() => setParams({})} />}
    </>
  );
}
