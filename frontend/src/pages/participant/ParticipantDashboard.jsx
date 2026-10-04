import { Button, Col, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useStore } from '../../store/store';
import { byId, myRegistration, userSubtitle, visibleEvents } from '../../store/selectors';
import { checkEligibility, eventPhase, registrationWindow } from '../../utils/eligibility';
import { fmtRange, fromNow } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { Avatar, Countdown, EmptyState, Panel, StatTile, Tag } from '../../components/ui';
import EventCard from '../../components/EventCard';
import { qrValue } from '../../components/PassCard';

export default function ParticipantDashboard({ user }) {
  useTitle('Home');
  const s = useStore();
  const now = Date.now();
  const myRegs = s.registrations.filter((r) => r.userId === user.id);
  const upcoming = s.passes
    .filter((p) => p.userId === user.id && p.status === 'ACTIVE')
    .map((p) => ({ pass: p, ev: byId(s.events, p.eventId) }))
    .filter((x) => x.ev && x.ev.endsAt > now)
    .sort((a, b) => a.ev.startsAt - b.ev.startsAt);
  const next = upcoming[0];
  const nextVenue = next && byId(s.locations, next.ev.venueId);
  const pending = myRegs.filter((r) => r.status === 'PENDING' || r.status === 'WAITLISTED').length;
  const attended = s.attendance.filter((a) => a.userId === user.id).length;
  const openForMe = visibleEvents(s, user)
    .filter((e) => e.mode !== 'AUTO_ASSIGN' && registrationWindow(e).open && checkEligibility(user, e).eligible)
    .filter((e) => { const r = myRegistration(s, e.id, user.id); return !r || r.status === 'CANCELLED'; })
    .sort((a, b) => a.regClosesAt - b.regClosesAt);
  const notes = s.notifications.filter((n) => n.userId === user.id).slice(0, 5);

  return (
    <>
      <div className="welcome-strip">
        <Avatar user={user} size={56} />
        <div className="flex-grow-1 min-w-0">
          <h1>Welcome, {user.name.split(' ')[0]}</h1>
          <div className="kv d-flex flex-wrap gap-3 mt-1">
            {user.urn && <span>URN <strong className="mono">{user.urn}</strong></span>}
            <span>{userSubtitle(user)}</span>
            {user.role === 'GUEST' && <Tag tone="info" icon="globe2">Guest account</Tag>}
          </div>
        </div>
        <Button as={Link} to="/events" variant="primary"><i className="bi bi-search me-1" />Find events</Button>
      </div>

      <Row className="g-3 mb-3">
        <Col xs={6} lg={3}><StatTile icon="qr-code" label="Active passes" value={upcoming.length} tone="primary" to="/my/passes" /></Col>
        <Col xs={6} lg={3}><StatTile icon="hourglass-split" label="Pending / waitlisted" value={pending} tone="warning" to="/my/registrations" /></Col>
        <Col xs={6} lg={3}><StatTile icon="door-open" label="Events attended" value={attended} tone="success" to="/my/registrations?tab=past" /></Col>
        <Col xs={6} lg={3}><StatTile icon="calendar-plus" label="Open for you" value={openForMe.length} hint="Eligible, not registered" tone="brand" to="/events" /></Col>
      </Row>

      <Row className="g-3">
        <Col lg={8} className="section-gap">
          <Panel title="Your next event" icon="ticket-perforated">
            {next ? (
              <div className="d-flex flex-wrap gap-3 align-items-center">
                <div className="p-2 border rounded bg-white"><QRCodeSVG value={qrValue(next.pass)} size={104} level="M" marginSize={1} aria-hidden="true" /></div>
                <div className="flex-grow-1 min-w-0">
                  <div className="d-flex gap-2 flex-wrap mb-1">
                    {eventPhase(next.ev) === 'LIVE' ? <Tag tone="danger" icon="broadcast">Happening now</Tag> : <Tag tone="primary" icon="alarm"><Countdown to={next.ev.startsAt} /></Tag>}
                  </div>
                  <h2 className="h5 fw-bold mb-1"><Link to={`/events/${next.ev.id}`} className="text-decoration-none">{next.ev.title}</Link></h2>
                  <div className="event-meta"><i className="bi bi-clock" />{fmtRange(next.ev.startsAt, next.ev.endsAt)}</div>
                  <div className="event-meta"><i className="bi bi-geo-alt" />{nextVenue?.name} · <Link to={`/campus?loc=${nextVenue?.id}`}>map</Link></div>
                </div>
                <div className="d-grid gap-2">
                  <Button as={Link} to={`/my/passes?open=${next.pass.id}`}><i className="bi bi-arrows-fullscreen me-1" />Show pass</Button>
                  <Button as={Link} to="/my/passes" variant="outline-primary">All passes</Button>
                </div>
              </div>
            ) : (
              <EmptyState icon="ticket-perforated" title="No upcoming passes" action={<Button as={Link} to="/events">Browse events</Button>}>
                Register for an event and your QR pass will appear here.
              </EmptyState>
            )}
          </Panel>

          <Panel title="Open for registration — recommended for you" icon="stars" actions={<Link to="/events" className="small">See all</Link>}>
            {openForMe.length ? (
              <Row className="g-3">
                {openForMe.slice(0, 3).map((e) => <Col md={6} xl={4} key={e.id}><EventCard event={e} user={user} /></Col>)}
              </Row>
            ) : (
              <EmptyState icon="calendar2-check" title="You're registered for everything open to you">New events will show up here.</EmptyState>
            )}
          </Panel>
        </Col>

        <Col lg={4} className="section-gap">
          <Panel title="Notifications" icon="bell" flush actions={<Link to="/notifications" className="small">View all</Link>}>
            <ul className="feed">
              {notes.map((n) => (
                <li key={n.id}>
                  <span className={`feed-icon tone-${n.read ? 'secondary' : 'primary'}`}><i className="bi bi-bell" aria-hidden="true" /></span>
                  <div className="min-w-0">
                    <Link to={n.link || '/notifications'} className="small fw-600 text-decoration-none d-block">{n.title}</Link>
                    <span className="small-2 text-muted-2">{fromNow(n.at)}</span>
                  </div>
                </li>
              ))}
              {!notes.length && <li className="text-muted-2 small">No notifications yet.</li>}
            </ul>
          </Panel>
          <Panel title="How entry works" icon="info-circle">
            <ol className="small ps-3 mb-0">
              <li className="mb-1">Register — the system checks your eligibility instantly.</li>
              <li className="mb-1">Your QR pass appears in <Link to="/my/passes">My Passes</Link> once confirmed.</li>
              <li className="mb-1">At the gate, open the pass and turn your screen brightness up.</li>
              <li>Security scans it once. A screenshot can't be reused after you enter.</li>
            </ol>
          </Panel>
        </Col>
      </Row>
    </>
  );
}
