import { Button, Col, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useApi } from '../../api/useApi';
import { fmtRange } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { Avatar, Countdown, EmptyState, Loading, Panel, StatTile, Tag } from '../../components/ui';
import EventCard from '../../components/EventCard';

export default function ParticipantDashboard({ user }) {
  useTitle('Home');
  const passes = useApi('/me/passes');
  const regs = useApi('/me/registrations');
  const open = useApi('/events?eligibleOnly=true&openOnly=true&size=12');
  const now = Date.now();

  const upcoming = (passes.data || []).filter((p) => p.status === 'ACTIVE' && p.event.endsAt > now).sort((a, b) => a.event.startsAt - b.event.startsAt);
  const next = upcoming[0];
  const pending = (regs.data || []).filter((r) => r.status === 'PENDING' || r.status === 'WAITLISTED').length;
  const attended = (passes.data || []).filter((p) => p.status === 'USED').length;
  const openForMe = (open.data?.items || []).filter((e) => !e.myRegistration || e.myRegistration.status === 'CANCELLED');
  const s = user.student;

  return (
    <>
      <div className="welcome-strip">
        <Avatar user={user} size={56} />
        <div className="flex-grow-1 min-w-0">
          <h1>Welcome, {user.name.split(' ')[0]}</h1>
          <div className="kv d-flex flex-wrap gap-3 mt-1">
            {s && <span>URN <strong className="mono">{s.urn}</strong></span>}
            {s && <span>{s.dept} · Sem {s.semester} · Sec {s.section}</span>}
            {s && !s.enrolled && <Tag tone="danger" icon="exclamation-triangle">Enrollment inactive</Tag>}
          </div>
        </div>
        <Button as={Link} to="/events" variant="primary"><i className="bi bi-search me-1" />Find events</Button>
      </div>

      <Row className="g-3 mb-3">
        <Col xs={6} lg={3}><StatTile icon="qr-code" label="Active passes" value={passes.data ? upcoming.length : '…'} tone="primary" to="/my/passes" /></Col>
        <Col xs={6} lg={3}><StatTile icon="hourglass-split" label="Pending / waitlisted" value={regs.data ? pending : '…'} tone="warning" to="/my/registrations?tab=pending" /></Col>
        <Col xs={6} lg={3}><StatTile icon="door-open" label="Events attended" value={passes.data ? attended : '…'} tone="success" to="/my/registrations?tab=past" /></Col>
        <Col xs={6} lg={3}><StatTile icon="calendar-plus" label="Open for you" value={open.data ? openForMe.length : '…'} hint="Eligible, not registered" tone="brand" to="/events?eligibleOnly=1&openOnly=1" /></Col>
      </Row>

      <Row className="g-3">
        <Col lg={8} className="section-gap">
          <Panel title="Your next event" icon="ticket-perforated">
            {!passes.data ? <Loading /> : next ? (
              <div className="d-flex flex-wrap gap-3 align-items-center">
                <div className="p-2 border rounded bg-white"><QRCodeSVG value={next.qr} size={104} level="M" marginSize={1} aria-hidden="true" /></div>
                <div className="flex-grow-1 min-w-0">
                  <div className="d-flex gap-2 flex-wrap mb-1">
                    {next.event.startsAt <= now ? <Tag tone="danger" icon="broadcast">Happening now</Tag> : <Tag tone="primary" icon="alarm"><Countdown to={next.event.startsAt} /></Tag>}
                  </div>
                  <h2 className="h5 fw-bold mb-1"><Link to={`/events/${next.event.id}`} className="text-decoration-none">{next.event.title}</Link></h2>
                  <div className="event-meta"><i className="bi bi-clock" />{fmtRange(next.event.startsAt, next.event.endsAt)}</div>
                  <div className="event-meta"><i className="bi bi-geo-alt" />{next.event.venueName}{next.event.gates.length > 0 && ` · ${next.event.gates.join(', ')}`}</div>
                </div>
                <div className="d-grid gap-2">
                  <Button as={Link} to={`/my/passes?open=${next.id}`}><i className="bi bi-arrows-fullscreen me-1" />Show pass</Button>
                  <Button as={Link} to="/my/passes" variant="outline-primary">All passes</Button>
                </div>
              </div>
            ) : (
              <EmptyState icon="ticket-perforated" title="No upcoming passes" action={<Button as={Link} to="/events">Browse events</Button>}>
                Register for an event and your QR pass will appear here.
              </EmptyState>
            )}
          </Panel>

          <Panel title="Open for registration — you're eligible" icon="stars" actions={<Link to="/events?eligibleOnly=1&openOnly=1" className="small">See all</Link>}>
            {!open.data ? <Loading /> : openForMe.length ? (
              <Row className="g-3">
                {openForMe.slice(0, 3).map((e) => <Col md={6} xl={4} key={e.id}><EventCard event={e} /></Col>)}
              </Row>
            ) : (
              <EmptyState icon="calendar2-check" title="Nothing new right now">You're registered for everything currently open to you.</EmptyState>
            )}
          </Panel>
        </Col>

        <Col lg={4} className="section-gap">
          <Panel title="My requests" icon="card-checklist" flush actions={<Link to="/my/registrations" className="small">View all</Link>}>
            <ul className="feed">
              {(regs.data || []).filter((r) => r.event.endsAt > now && r.status !== 'CANCELLED').slice(0, 5).map((r) => (
                <li key={r.id}>
                  <span className={`feed-icon tone-${r.status === 'CONFIRMED' ? 'success' : r.status === 'REJECTED' ? 'danger' : 'warning'}`}>
                    <i className={`bi bi-${r.status === 'CONFIRMED' ? 'check2' : r.status === 'REJECTED' ? 'x' : 'hourglass-split'}`} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <Link to={`/events/${r.event.id}`} className="small fw-600 text-decoration-none d-block text-truncate">{r.event.title}</Link>
                    <span className="small-2 text-muted-2">{r.status === 'WAITLISTED' ? `Waitlist #${r.waitlistPosition}` : r.status.toLowerCase()}</span>
                  </div>
                </li>
              ))}
              {regs.data && !regs.data.some((r) => r.event.endsAt > now && r.status !== 'CANCELLED') && <li className="text-muted-2 small">No upcoming registrations.</li>}
            </ul>
          </Panel>
          <Panel title="How entry works" icon="info-circle">
            <ol className="small ps-3 mb-0">
              <li className="mb-1">Register — the server checks your eligibility instantly.</li>
              <li className="mb-1">Your QR pass appears in <Link to="/my/passes">My Passes</Link> once your seat is confirmed.</li>
              <li className="mb-1">Gates open 60 minutes before the start. Open the pass and turn your screen brightness up.</li>
              <li>Security scans it once. A copy or screenshot can't be used again after you enter.</li>
            </ol>
          </Panel>
        </Col>
      </Row>
    </>
  );
}
