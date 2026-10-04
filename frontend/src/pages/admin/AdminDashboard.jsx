import { Button, Col, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useStore } from '../../store/store';
import { byId, eventStats } from '../../store/selectors';
import { checkinsByDay, deptBreakdown, popularity, userTypeSplit } from '../../utils/analytics';
import { eventPhase } from '../../utils/eligibility';
import { fmtTime, fromNow, titleCase } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { Panel, StatTile, Tag } from '../../components/ui';
import { CompareBars, Donut, TrendLines } from '../../components/Charts';

export default function AdminDashboard() {
  useTitle('Admin dashboard');
  const s = useStore();
  const now = Date.now();
  const students = s.users.filter((u) => u.role === 'STUDENT');
  const guests = s.users.filter((u) => u.role === 'GUEST');
  const published = s.events.filter((e) => e.status !== 'DRAFT');
  const ids = published.map((e) => e.id);
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const checkinsToday = s.attendance.filter((a) => a.at >= todayStart).length;
  const pending = s.registrations.filter((r) => r.status === 'PENDING').length;
  const locked = s.users.filter((u) => u.status === 'LOCKED').length;
  const live = s.events.filter((e) => eventPhase(e) === 'LIVE');
  const upcoming = s.events.filter((e) => e.startsAt > now && e.status === 'PUBLISHED').length;
  const failedToday = s.scanLogs.filter((l) => l.at >= todayStart && l.result !== 'SUCCESS').length;
  const pop = popularity(s, published).slice(0, 6).map((r) => ({ name: r.name.split(/[—:]/)[0].trim().slice(0, 22), registered: r.registrations, attended: r.attended }));

  return (
    <>
      <div className="welcome-strip">
        <i className="bi bi-shield-lock fs-1" style={{ color: 'var(--gn-maroon)' }} aria-hidden="true" />
        <div className="flex-grow-1">
          <h1>Control panel</h1>
          <div className="kv">Smart Campus Events · {s.events.length} events · {s.users.length} accounts</div>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Button as={Link} to="/admin/import" variant="outline-primary"><i className="bi bi-file-earmark-arrow-up me-1" />Import students</Button>
          <Button as={Link} to="/manage/events/new" variant="brand"><i className="bi bi-calendar-plus me-1" />Create event</Button>
        </div>
      </div>

      <Row className="g-3 mb-3">
        <Col xs={6} md={4} xl={2}><StatTile icon="mortarboard" label="Students" value={students.length} hint={`${students.filter((u) => !u.enrolled).length} not enrolled`} tone="primary" to="/admin/users?role=STUDENT" /></Col>
        <Col xs={6} md={4} xl={2}><StatTile icon="person-badge" label="Guests" value={guests.length} tone="info" to="/admin/users?role=GUEST" /></Col>
        <Col xs={6} md={4} xl={2}><StatTile icon="calendar3" label="Upcoming events" value={upcoming} tone="success" to="/manage/events?filter=upcoming" /></Col>
        <Col xs={6} md={4} xl={2}><StatTile icon="door-open" label="Check-ins today" value={checkinsToday} hint={`${failedToday} rejected scans`} tone="brand" to="/manage/live" /></Col>
        <Col xs={6} md={4} xl={2}><StatTile icon="hourglass-split" label="Pending approvals" value={pending} tone="warning" to="/manage/events?filter=pending" /></Col>
        <Col xs={6} md={4} xl={2}><StatTile icon="lock" label="Locked accounts" value={locked} tone={locked ? 'danger' : 'secondary'} to="/admin/users?status=LOCKED" /></Col>
      </Row>

      {live.length > 0 && (
        <Panel className="mb-3" title="Live now" icon="broadcast" flush>
          <ul className="feed">
            {live.map((e) => {
              const st = eventStats(s, e.id);
              return (
                <li key={e.id}>
                  <span className="feed-icon tone-danger"><i className="bi bi-broadcast" aria-hidden="true" /></span>
                  <div className="flex-grow-1 min-w-0">
                    <div className="fw-600">{e.title}</div>
                    <div className="small-2 text-muted-2">{byId(s.locations, e.venueId)?.name} · until {fmtTime(e.endsAt)} · {st.attended}/{st.approved} checked in</div>
                  </div>
                  <Button size="sm" variant="brand" as={Link} to={`/manage/events/${e.id}?tab=live`}>Live view</Button>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <Row className="g-3">
        <Col lg={8}><Panel title="Department-wise participation (all events)" icon="diagram-3"><CompareBars data={deptBreakdown(s, ids)} height={280} /></Panel></Col>
        <Col lg={4}><Panel title="Students vs guests" icon="people"><Donut data={userTypeSplit(s, ids)} height={280} /></Panel></Col>
        <Col lg={7}><Panel title="Most popular events" icon="trophy"><CompareBars data={pop} layout="vertical" height={300} /></Panel></Col>
        <Col lg={5}>
          <Panel title="Recent activity" icon="journal-text" flush actions={<Link to="/admin/audit" className="small">Audit log</Link>}>
            <ul className="feed">
              {s.audit.slice(0, 8).map((a) => (
                <li key={a.id}>
                  <span className={`feed-icon tone-${a.action.includes('FAIL') || a.action.includes('CANCEL') ? 'danger' : 'primary'}`}><i className="bi bi-journal-text" aria-hidden="true" /></span>
                  <div className="flex-grow-1 min-w-0">
                    <div className="small fw-600">{titleCase(a.action)}</div>
                    <div className="small-2 text-muted-2 text-truncate">{byId(s.users, a.actorId)?.name || 'System'} · {a.details}</div>
                  </div>
                  <span className="small-2 text-muted-2 text-nowrap">{fromNow(a.at)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </Col>
        <Col xs={12}><Panel title="Platform activity — last 14 days" icon="graph-up"><TrendLines data={checkinsByDay(s, null, 14)} /></Panel></Col>
      </Row>
      <div className="mt-2"><Tag icon="info-circle">Charts read the same mock data the other roles change, so actions in other tabs show up here.</Tag></div>
    </>
  );
}
