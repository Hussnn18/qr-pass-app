import { Button, Col, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useStore } from '../../store/store';
import { useCurrentUser } from '../../store/session';
import { byId } from '../../store/selectors';
import { eventPhase } from '../../utils/eligibility';
import { fmtDate, fmtTime } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { Avatar, Countdown, EmptyState, PageHeader, Panel, StatTile, Tag } from '../../components/ui';

/** Duty roster for a security user. Used for both "/" and "/scan/assignments". */
export function DutyList({ user, showPast = false }) {
  const s = useStore();
  const now = Date.now();
  const duties = s.assignments
    .filter((a) => a.userId === user.id)
    .map((a) => ({ a, ev: byId(s.events, a.eventId), gate: byId(s.gates, a.gateId) }))
    .filter((d) => d.ev && d.gate && ['PUBLISHED', 'CLOSED', 'COMPLETED'].includes(d.ev.status))
    .filter((d) => showPast || d.ev.endsAt > now)
    .sort((x, y) => x.ev.startsAt - y.ev.startsAt);
  if (!duties.length) return <EmptyState icon="shield-check" title="No duties assigned">Organizers assign gate duty from each event's Gates &amp; security tab.</EmptyState>;
  return (
    <Row className="g-3">
      {duties.map(({ a, ev, gate }) => {
        const phase = eventPhase(ev);
        const opens = ev.startsAt - 36e5;
        const scanning = now >= opens && now <= ev.endsAt;
        const mine = s.attendance.filter((x) => x.eventId === ev.id && x.gateId === gate.id).length;
        return (
          <Col md={6} key={a.id}>
            <Panel className={`h-100 ${phase === 'LIVE' ? 'border-danger' : ''}`}>
              <div className="d-flex justify-content-between gap-2 flex-wrap mb-2">
                {phase === 'LIVE' ? <Tag tone="danger" icon="broadcast">Live now</Tag> : phase === 'ENDED' ? <Tag icon="flag">Finished</Tag> : <Tag tone="primary" icon="calendar">{fmtDate(ev.startsAt)}</Tag>}
                <span className="small text-muted-2">{mine} entries at this gate</span>
              </div>
              <h2 className="h6 fw-bold mb-1">{ev.title}</h2>
              <div className="event-meta"><i className="bi bi-door-open" /><strong>{gate.name}</strong> · {byId(s.locations, ev.venueId)?.name}</div>
              <div className="event-meta"><i className="bi bi-clock" />Gate opens {fmtTime(opens)} · event {fmtTime(ev.startsAt)}–{fmtTime(ev.endsAt)}</div>
              <div className="mt-3">
                {scanning ? (
                  <Button as={Link} to={`/scan?event=${ev.id}&gate=${gate.id}`} variant="brand" className="w-100"><i className="bi bi-upc-scan me-2" />Start scanning</Button>
                ) : phase === 'ENDED' ? (
                  <Button as={Link} to={`/scan/history?event=${ev.id}`} variant="light" className="w-100">View scans</Button>
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

export default function SecurityHome({ user: given }) {
  const current = useCurrentUser();
  const user = given || current;
  const s = useStore();
  useTitle(given ? 'Gate duty' : 'My assignments');
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const myScans = s.scanLogs.filter((l) => l.by === user.id && l.at >= todayStart);
  const ok = myScans.filter((l) => l.result === 'SUCCESS').length;

  if (!given) {
    return (
      <>
        <PageHeader title="My assignments" subtitle="Every gate duty assigned to you, including past events." />
        <DutyList user={user} showPast />
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
        <Col xs={4}><StatTile icon="check-circle" label="Allowed today" value={ok} tone="success" /></Col>
        <Col xs={4}><StatTile icon="x-octagon" label="Rejected today" value={myScans.length - ok} tone="danger" /></Col>
        <Col xs={4}><StatTile icon="clock-history" label="Scan history" value={myScans.length} tone="primary" to="/scan/history" /></Col>
      </Row>
      <h2 className="h6 fw-bold mb-2" style={{ color: 'var(--gn-navy)' }}>Upcoming duties</h2>
      <DutyList user={user} />
      <Panel title="At the gate" icon="info-circle" className="mt-3">
        <Row className="small g-3">
          <Col md={4}><strong className="text-success"><i className="bi bi-check-circle-fill me-1" />Green</strong> — let them in. Compare the photo with the person.</Col>
          <Col md={4}><strong className="text-warning"><i className="bi bi-exclamation-triangle-fill me-1" />Amber</strong> — already used or too early. Check first-entry time; call the organizer if unsure.</Col>
          <Col md={4}><strong className="text-danger"><i className="bi bi-x-octagon-fill me-1" />Red</strong> — do not allow entry. Direct them to the help desk.</Col>
        </Row>
      </Panel>
    </>
  );
}
