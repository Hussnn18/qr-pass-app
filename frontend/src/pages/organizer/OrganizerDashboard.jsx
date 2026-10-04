import { Button, Col, ProgressBar, Row, Table } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useApi } from '../../api/useApi';
import { eventPhase } from '../../utils/events';
import { fmtDateShort, fmtTime, fromNow, pct } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { Avatar, EmptyState, Loading, Panel, StatTile, StatusBadge } from '../../components/ui';

export default function OrganizerDashboard({ user }) {
  useTitle('Organizer home');
  const events = useApi('/manage/events', { poll: 30000 });
  const requests = useApi('/manage/requests?limit=6');
  const now = Date.now();
  const mine = events.data || [];
  const live = mine.filter((e) => eventPhase(e) === 'LIVE');
  const upcoming = mine.filter((e) => e.startsAt > now && ['PUBLISHED', 'CLOSED', 'DRAFT'].includes(e.status));
  const pending = mine.reduce((n, e) => n + e.stats.pending, 0);
  const active = mine.filter((e) => e.endsAt > now).reduce((n, e) => n + e.stats.confirmed + e.stats.pending + e.stats.waitlisted, 0);
  const enteredLive = live.reduce((n, e) => n + e.stats.entered, 0);

  const attention = [];
  mine.filter((e) => e.endsAt > now).forEach((e) => {
    if (e.stats.pending) attention.push({ e, icon: 'person-check', tone: 'warning', text: `${e.stats.pending} request${e.stats.pending > 1 ? 's' : ''} waiting for approval`, to: `/manage/events/${e.id}?tab=registrations` });
    if (e.status === 'DRAFT') attention.push({ e, icon: 'pencil', tone: 'secondary', text: 'Draft — students can’t see it yet', to: `/manage/events/${e.id}` });
    if (['PUBLISHED', 'CLOSED'].includes(e.status) && e.gates.length === 0) attention.push({ e, icon: 'door-closed', tone: 'danger', text: 'No entry gates', to: `/manage/events/${e.id}/edit` });
    if (e.stats.waitlisted && e.stats.remaining > 0) attention.push({ e, icon: 'list-ol', tone: 'info', text: `${e.stats.waitlisted} waitlisted and ${e.stats.remaining} seats free`, to: `/manage/events/${e.id}?tab=registrations` });
  });

  return (
    <>
      <div className="welcome-strip">
        <Avatar user={user} size={56} />
        <div className="flex-grow-1">
          <h1>Good to see you, {user.name.replace(/^(Prof|Dr|Mr|Ms)\.?\s+/, '').split(' ')[0]}</h1>
          <div className="kv">{user.unit} · {mine.length} event{mine.length === 1 ? '' : 's'}</div>
        </div>
        <Button as={Link} to="/manage/events/new" variant="brand"><i className="bi bi-calendar-plus me-1" />Create event</Button>
      </div>

      <Row className="g-3 mb-3">
        <Col xs={6} lg={3}><StatTile icon="calendar3" label="Upcoming events" value={events.data ? upcoming.length : '…'} tone="primary" to="/manage/events?filter=upcoming" /></Col>
        <Col xs={6} lg={3}><StatTile icon="person-check" label="Pending approvals" value={events.data ? pending : '…'} tone="warning" to="/manage/events?filter=pending" /></Col>
        <Col xs={6} lg={3}><StatTile icon="people" label="Active registrations" value={events.data ? active : '…'} tone="success" /></Col>
        <Col xs={6} lg={3}><StatTile icon="door-open" label="Entered (live events)" value={events.data ? enteredLive : '…'} tone="brand" to="/manage/events?filter=live" /></Col>
      </Row>

      {live.map((e) => (
        <Panel key={e.id} className="mb-3 border-danger" title={<><span className="live-chip me-2">● LIVE</span>{e.title}</>}
          actions={<div className="d-flex gap-2"><Button size="sm" variant="light" as={Link} to="/scan"><i className="bi bi-upc-scan me-1" />Scanner</Button><Button size="sm" variant="brand" as={Link} to={`/manage/events/${e.id}`}>Manage</Button></div>}>
          <Row className="align-items-center g-3">
            <Col md={3} className="text-center"><div className="big-counter">{e.stats.entered}</div><div className="small text-muted-2">entered of {e.stats.confirmed}</div></Col>
            <Col md={9}>
              <ProgressBar now={pct(e.stats.entered, e.stats.confirmed)} label={`${pct(e.stats.entered, e.stats.confirmed)}%`} style={{ height: 18 }} aria-label="Share entered" />
              <div className="small text-muted-2 mt-2">Ends {fmtTime(e.endsAt)} · {e.venue.name} · refreshes every 30 s</div>
            </Col>
          </Row>
        </Panel>
      ))}

      <Row className="g-3">
        <Col lg={7}>
          <Panel title="Upcoming events" icon="calendar-event" flush actions={<Link to="/manage/events" className="small">All events</Link>}>
            {!events.data ? <Loading /> : !upcoming.length ? <EmptyState icon="calendar-plus" title="No upcoming events" action={<Button as={Link} to="/manage/events/new">Create one</Button>} /> : (
              <Table hover responsive className="mb-0 align-middle table-stack">
                <thead><tr><th>Event</th><th>Date</th><th>Seats</th><th>Status</th></tr></thead>
                <tbody>
                  {upcoming.slice(0, 8).map((e) => (
                    <tr key={e.id}>
                      <td className="td-main"><Link to={`/manage/events/${e.id}`} className="fw-600 text-decoration-none">{e.title}</Link></td>
                      <td data-label="Date">{fmtDateShort(e.startsAt)} · {fmtTime(e.startsAt)}</td>
                      <td data-label="Seats" style={{ minWidth: 120 }}>
                        <div className="small-2">{e.stats.confirmed}/{e.stats.capacity}</div>
                        <ProgressBar now={pct(e.stats.confirmed, e.stats.capacity)} style={{ height: 5 }} aria-label="Seats filled" />
                      </td>
                      <td data-label="Status"><StatusBadge kind="event" status={e.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
        </Col>
        <Col lg={5} className="section-gap">
          <Panel title="Needs your attention" icon="exclamation-diamond" flush>
            {!events.data ? <Loading /> : !attention.length ? <EmptyState icon="check2-circle" title="All clear">Nothing needs action right now.</EmptyState> : (
              <ul className="feed">
                {attention.slice(0, 8).map((a, i) => (
                  <li key={i}>
                    <span className={`feed-icon tone-${a.tone}`}><i className={`bi bi-${a.icon}`} aria-hidden="true" /></span>
                    <div className="flex-grow-1 min-w-0">
                      <div className="small fw-600 text-truncate">{a.e.title}</div>
                      <div className="small-2 text-muted-2">{a.text}</div>
                    </div>
                    <Button size="sm" variant="light" as={Link} to={a.to}>Review</Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Latest requests" icon="inbox" flush>
            <ul className="feed">
              {(requests.data || []).map((r) => (
                <li key={r.registrationId}>
                  <Avatar user={r.person} size={30} />
                  <div className="flex-grow-1 min-w-0">
                    <div className="small fw-600">{r.person.name} <span className="mono text-muted-2 fw-normal">{r.person.idLabel}</span></div>
                    <div className="small-2 text-muted-2 text-truncate">{r.eventTitle} · {fromNow(r.registeredAt)}</div>
                  </div>
                  <Button size="sm" variant="light" as={Link} to={`/manage/events/${r.eventId}?tab=registrations`}>Open</Button>
                </li>
              ))}
              {requests.data && !requests.data.length && <li className="small text-muted-2">No pending requests.</li>}
            </ul>
          </Panel>
        </Col>
      </Row>
    </>
  );
}
