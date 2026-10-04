import { Button, Col, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useApi } from '../../api/useApi';
import { fmtDate, fmtTime } from '../../utils/format';
import { useNow, useTitle } from '../../utils/hooks';
import { Async, Avatar, Countdown, EmptyState, PageHeader, Panel, StatTile, Tag } from '../../components/ui';

/** Gate duties from GET /scan/assignments. */
function DutyList({ options }) {
  const now = useNow(30000);
  if (!options.length) {
    return <EmptyState icon="shield-check" title="No duties assigned">Organizers assign gate duty from each event's “Gates &amp; security” tab.</EmptyState>;
  }
  return (
    <Row className="g-3">
      {options.map((o) => {
        const ev = o.event;
        const opens = ev.startsAt - 36e5;
        const scanning = now >= opens && now <= ev.endsAt && ev.status !== 'COMPLETED';
        const ended = now > ev.endsAt || ev.status === 'COMPLETED';
        const live = now >= ev.startsAt && !ended;
        return (
          <Col md={6} key={`${ev.id}-${o.gateId}`}>
            <Panel className={`h-100 ${live ? 'border-danger' : ''}`}>
              <div className="d-flex justify-content-between gap-2 flex-wrap mb-2">
                {live ? <Tag tone="danger" icon="broadcast">Live now</Tag> : ended ? <Tag icon="flag">Finished</Tag> : <Tag tone="primary" icon="calendar">{fmtDate(ev.startsAt)}</Tag>}
                <span className="small text-muted-2">{o.enteredAtGate} entered here · {o.enteredTotal}/{o.confirmed} overall</span>
              </div>
              <h2 className="h6 fw-bold mb-1">{ev.title}</h2>
              <div className="event-meta"><i className="bi bi-door-open" /><strong>{o.gateName}</strong> · {ev.venueName}</div>
              <div className="event-meta"><i className="bi bi-clock" />Gate opens {fmtTime(opens)} · event {fmtTime(ev.startsAt)}–{fmtTime(ev.endsAt)}</div>
              <div className="mt-3">
                {scanning ? (
                  <Button as={Link} to={`/scan?event=${ev.id}&gate=${o.gateId}`} variant="brand" className="w-100"><i className="bi bi-upc-scan me-2" />Start scanning</Button>
                ) : ended ? (
                  <Button as={Link} to={`/scan/history?eventId=${ev.id}`} variant="light" className="w-100">View scans</Button>
                ) : (
                  <Button variant="light" className="w-100" disabled><Countdown to={opens} prefix="Scanner unlocks in" /></Button>
                )}
              </div>
            </Panel>
          </Col>
        );
      })}
    </Row>
  );
}

export default function SecurityHome({ user, home = false }) {
  useTitle(home ? 'Gate duty' : 'My assignments');
  const options = useApi(`/scan/assignments?includePast=${!home}`, { poll: 30000 });
  const summary = useApi(home ? '/scan/summary' : null, { poll: 30000 });

  if (!home) {
    return (
      <>
        <PageHeader title="My assignments" subtitle="Every gate duty assigned to you, including finished events." />
        <Async state={options}>{(list) => <DutyList options={list} />}</Async>
      </>
    );
  }
  return (
    <>
      <div className="welcome-strip">
        <Avatar user={user} size={56} />
        <div className="flex-grow-1">
          <h1>Gate duty — {user.name}</h1>
          <div className="kv">{user.unit} · {fmtDate(Date.now())}</div>
        </div>
        <Button as={Link} to="/scan" variant="brand" size="lg"><i className="bi bi-upc-scan me-2" />Open scanner</Button>
      </div>
      <Row className="g-3 mb-3">
        <Col xs={4}><StatTile icon="check-circle" label="Allowed today" value={summary.data?.allowedToday ?? '…'} tone="success" /></Col>
        <Col xs={4}><StatTile icon="x-octagon" label="Refused today" value={summary.data?.rejectedToday ?? '…'} tone="danger" /></Col>
        <Col xs={4}><StatTile icon="clock-history" label="Scan history" value={<i className="bi bi-arrow-right" />} tone="primary" to="/scan/history" /></Col>
      </Row>
      <h2 className="h6 fw-bold mb-2" style={{ color: 'var(--gn-navy)' }}>Upcoming duties</h2>
      <Async state={options}>{(list) => <DutyList options={list} />}</Async>
      <Panel title="At the gate" icon="info-circle" className="mt-3">
        <Row className="small g-3">
          <Col md={4}><strong className="text-success"><i className="bi bi-check-circle-fill me-1" />Green</strong> — let them in. Compare the photo with the person.</Col>
          <Col md={4}><strong className="text-warning"><i className="bi bi-exclamation-triangle-fill me-1" />Amber</strong> — already used or too early. Check the first-entry time; call the organizer if unsure.</Col>
          <Col md={4}><strong className="text-danger"><i className="bi bi-x-octagon-fill me-1" />Red</strong> — do not allow entry. Send them to the help desk.</Col>
        </Row>
      </Panel>
    </>
  );
}
