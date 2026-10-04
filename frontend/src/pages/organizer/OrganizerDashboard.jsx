import { Button, Col, ProgressBar, Row, Table } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useStore } from '../../store/store';
import { byId, eventStats, managedEvents, userSubtitle } from '../../store/selectors';
import { eventPhase } from '../../utils/eligibility';
import { fmtDateShort, fmtTime, fromNow, pct } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { Avatar, EmptyState, Panel, StatTile, StatusBadge, Tag } from '../../components/ui';
import { CompareBars } from '../../components/Charts';

export default function OrganizerDashboard({ user }) {
  useTitle('Organizer home');
  const s = useStore();
  const now = Date.now();
  const mine = managedEvents(s, user);
  const ids = new Set(mine.map((e) => e.id));
  const live = mine.filter((e) => eventPhase(e) === 'LIVE');
  const upcoming = mine.filter((e) => e.startsAt > now && ['PUBLISHED', 'CLOSED', 'DRAFT'].includes(e.status)).sort((a, b) => a.startsAt - b.startsAt);
  const pending = s.registrations.filter((r) => ids.has(r.eventId) && r.status === 'PENDING');
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const checkinsToday = s.attendance.filter((a) => ids.has(a.eventId) && a.at >= todayStart).length;
  const regs = s.registrations.filter((r) => ids.has(r.eventId) && r.status !== 'CANCELLED' && r.status !== 'REJECTED').length;

  const attention = [];
  mine.forEach((e) => {
    const st = eventStats(s, e.id);
    if (st.pending) attention.push({ e, icon: 'person-check', tone: 'warning', text: `${st.pending} request${st.pending > 1 ? 's' : ''} waiting for approval`, to: `/manage/events/${e.id}?tab=registrations` });
    if (e.status === 'DRAFT') attention.push({ e, icon: 'pencil', tone: 'secondary', text: 'Draft — not visible to students yet', to: `/manage/events/${e.id}/edit` });
    if (['PUBLISHED', 'CLOSED'].includes(e.status) && e.endsAt > now) {
      const unstaffed = e.gateIds.filter((g) => !s.assignments.some((a) => a.eventId === e.id && a.gateId === g));
      if (unstaffed.length) attention.push({ e, icon: 'shield-exclamation', tone: 'danger', text: `${unstaffed.length} gate${unstaffed.length > 1 ? 's have' : ' has'} no security assigned`, to: `/manage/events/${e.id}?tab=gates` });
    }
    if (st.waitlisted && st.remaining > 0) attention.push({ e, icon: 'list-ol', tone: 'info', text: `${st.waitlisted} waitlisted and ${st.remaining} seats free`, to: `/manage/events/${e.id}?tab=registrations` });
  });

  const chart = mine.filter((e) => e.status !== 'DRAFT').slice(0, 8).map((e) => {
    const st = eventStats(s, e.id);
    return { name: e.title.split(/[—:-]/)[0].trim().slice(0, 18), registered: st.active, attended: st.attended };
  });

  return (
    <>
      <div className="welcome-strip">
        <Avatar user={user} size={56} />
        <div className="flex-grow-1">
          <h1>Good to see you, {user.name.replace(/^(Prof|Dr|Mr|Ms)\.?\s+/, '').split(' ')[0]}</h1>
          <div className="kv">{userSubtitle(user)} · {mine.length} event{mine.length === 1 ? '' : 's'}</div>
        </div>
        <Button as={Link} to="/manage/events/new" variant="brand"><i className="bi bi-calendar-plus me-1" />Create event</Button>
      </div>

      <Row className="g-3 mb-3">
        <Col xs={6} lg={3}><StatTile icon="calendar3" label="Upcoming events" value={upcoming.length} tone="primary" to="/manage/events" /></Col>
        <Col xs={6} lg={3}><StatTile icon="person-check" label="Pending approvals" value={pending.length} tone="warning" to="/manage/events?filter=pending" /></Col>
        <Col xs={6} lg={3}><StatTile icon="people" label="Active registrations" value={regs} tone="success" /></Col>
        <Col xs={6} lg={3}><StatTile icon="door-open" label="Check-ins today" value={checkinsToday} tone="brand" to="/manage/live" /></Col>
      </Row>

      {live.map((e) => {
        const st = eventStats(s, e.id);
        return (
          <Panel key={e.id} className="mb-3 border-danger" title={<><span className="live-chip me-2">● LIVE</span>{e.title}</>} actions={<Button size="sm" variant="brand" as={Link} to={`/manage/events/${e.id}?tab=live`}><i className="bi bi-broadcast me-1" />Open live view</Button>}>
            <Row className="align-items-center g-3">
              <Col md={3} className="text-center"><div className="big-counter">{st.attended}</div><div className="small text-muted-2">checked in of {st.approved}</div></Col>
              <Col md={9}>
                <ProgressBar now={pct(st.attended, st.approved)} label={`${pct(st.attended, st.approved)}%`} style={{ height: 18 }} aria-label="Attendance progress" />
                <div className="small text-muted-2 mt-2">Ends {fmtTime(e.endsAt)} · {byId(s.locations, e.venueId)?.name}</div>
              </Col>
            </Row>
          </Panel>
        );
      })}

      <Row className="g-3">
        <Col lg={7} className="section-gap">
          <Panel title="Upcoming events" icon="calendar-event" flush actions={<Link to="/manage/events" className="small">All events</Link>}>
            {!upcoming.length ? <EmptyState icon="calendar-plus" title="No upcoming events" action={<Button as={Link} to="/manage/events/new">Create one</Button>} /> : (
              <Table hover responsive className="mb-0 align-middle table-stack">
                <thead><tr><th>Event</th><th>Date</th><th>Seats</th><th>Status</th></tr></thead>
                <tbody>
                  {upcoming.slice(0, 6).map((e) => {
                    const st = eventStats(s, e.id);
                    return (
                      <tr key={e.id}>
                        <td className="td-main"><Link to={`/manage/events/${e.id}`} className="fw-600 text-decoration-none">{e.title}</Link></td>
                        <td data-label="Date">{fmtDateShort(e.startsAt)} · {fmtTime(e.startsAt)}</td>
                        <td data-label="Seats" style={{ minWidth: 120 }}>
                          <div className="small-2">{st.approved}/{e.capacity}</div>
                          <ProgressBar now={st.fill} style={{ height: 5 }} aria-label={`${st.fill}% full`} />
                        </td>
                        <td data-label="Status"><StatusBadge kind="event" status={e.status} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Panel>
          <Panel title="Registrations vs check-ins" icon="bar-chart-line">
            <CompareBars data={chart} />
          </Panel>
        </Col>
        <Col lg={5}>
          <Panel title="Needs your attention" icon="exclamation-diamond" flush>
            {!attention.length ? <EmptyState icon="check2-circle" title="All clear">Nothing needs action right now.</EmptyState> : (
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
              {pending.sort((a, b) => b.registeredAt - a.registeredAt).slice(0, 5).map((r) => {
                const u = byId(s.users, r.userId);
                return (
                  <li key={r.id}>
                    <Avatar user={u} size={30} />
                    <div className="flex-grow-1 min-w-0">
                      <div className="small fw-600">{u?.name} {u?.role === 'GUEST' && <Tag tone="info">Guest</Tag>}</div>
                      <div className="small-2 text-muted-2 text-truncate">{byId(s.events, r.eventId)?.title} · {fromNow(r.registeredAt)}</div>
                    </div>
                  </li>
                );
              })}
              {!pending.length && <li className="small text-muted-2">No pending requests.</li>}
            </ul>
          </Panel>
        </Col>
      </Row>
    </>
  );
}
