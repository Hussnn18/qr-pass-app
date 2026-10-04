import { Button, Col, ProgressBar, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useApi } from '../../api/useApi';
import { fmtTime, pct } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { Panel, StatTile } from '../../components/ui';

export default function AdminDashboard() {
  useTitle('Admin home');
  const res = useApi('/admin/summary', { poll: 30000 });
  const s = res.data;
  const v = (x) => (s ? x : '…');

  return (
    <>
      <div className="welcome-strip">
        <i className="bi bi-shield-lock fs-1" style={{ color: 'var(--gn-maroon)' }} aria-hidden="true" />
        <div className="flex-grow-1">
          <h1>Control panel</h1>
          <div className="kv">Smart Campus Events · objectives 1–3</div>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <Button as={Link} to="/admin/import" variant="outline-primary"><i className="bi bi-file-earmark-arrow-up me-1" />Import students</Button>
          <Button as={Link} to="/manage/events/new" variant="brand"><i className="bi bi-calendar-plus me-1" />Create event</Button>
        </div>
      </div>

      <Row className="g-3 mb-3">
        <Col xs={6} md={4} xl={2}><StatTile icon="mortarboard" label="Students" value={v(s?.students)} hint={s ? `${s.notEnrolled} not enrolled` : null} tone="primary" to="/admin/users?role=STUDENT" /></Col>
        <Col xs={6} md={4} xl={2}><StatTile icon="easel2" label="Organizers" value={v(s?.organizers)} tone="info" to="/admin/users?role=ORGANIZER" /></Col>
        <Col xs={6} md={4} xl={2}><StatTile icon="shield-check" label="Security staff" value={v(s?.security)} tone="secondary" to="/admin/users?role=SECURITY" /></Col>
        <Col xs={6} md={4} xl={2}><StatTile icon="calendar3" label="Upcoming events" value={v(s?.upcomingEvents)} tone="success" to="/manage/events?filter=upcoming" /></Col>
        <Col xs={6} md={4} xl={2}><StatTile icon="hourglass-split" label="Pending approvals" value={v(s?.pendingApprovals)} tone="warning" to="/manage/events?filter=pending" /></Col>
        <Col xs={6} md={4} xl={2}><StatTile icon="lock" label="Locked accounts" value={v(s?.lockedAccounts)} tone={s?.lockedAccounts ? 'danger' : 'secondary'} to="/admin/users?status=LOCKED" /></Col>
      </Row>

      <Row className="g-3">
        <Col lg={7}>
          <Panel title="Events with gates open now" icon="broadcast" flush>
            <ul className="feed">
              {(s?.live || []).map((e) => (
                <li key={e.id}>
                  <span className="feed-icon tone-danger"><i className="bi bi-broadcast" aria-hidden="true" /></span>
                  <div className="flex-grow-1 min-w-0">
                    <div className="fw-600">{e.title}</div>
                    <div className="small-2 text-muted-2">{e.venueName} · until {fmtTime(e.endsAt)} · {e.entered}/{e.confirmed} entered</div>
                    <ProgressBar now={pct(e.entered, e.confirmed)} style={{ height: 5 }} className="mt-1" aria-label="Share entered" />
                  </div>
                  <Button size="sm" variant="light" as={Link} to={`/manage/events/${e.id}`}>Manage</Button>
                </li>
              ))}
              {s && !s.live.length && <li className="small text-muted-2">No event has its gates open right now.</li>}
            </ul>
          </Panel>
        </Col>
        <Col lg={5}>
          <Panel title="Today" icon="calendar-day">
            <div className="d-flex align-items-center gap-3">
              <div className="big-counter">{v(s?.entriesToday)}</div>
              <div className="small text-muted-2">entries recorded at gates today</div>
            </div>
            <hr />
            <div className="small d-grid gap-2">
              <Link to="/admin/users"><i className="bi bi-people me-2" />Manage users and roles</Link>
              <Link to="/admin/venues"><i className="bi bi-building me-2" />Venues and entry gates</Link>
              <Link to="/admin/departments"><i className="bi bi-diagram-3 me-2" />Departments</Link>
              <Link to="/scan/history"><i className="bi bi-clock-history me-2" />All scan history</Link>
            </div>
            <p className="small-2 text-muted-2 mt-3 mb-0">Analytics, reports and the audit-log viewer arrive with objective 5. Audit entries are already being recorded.</p>
          </Panel>
        </Col>
      </Row>
    </>
  );
}
