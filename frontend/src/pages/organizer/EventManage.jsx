import { Button, Col, Nav, Row } from 'react-bootstrap';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useApi } from '../../api/useApi';
import { CATEGORIES, MODES } from '../../data/constants';
import { useCurrentUser } from '../../auth/AuthContext';
import { eligibilitySummary, eventPhase } from '../../utils/events';
import { fmtDateTime, fmtRange, pct } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { EmptyState, Loading, ModeBadge, PageHeader, Panel, StatTile, StatusBadge, Tag } from '../../components/ui';
import { attempt } from '../../components/feedback';
import { EventActionsMenu } from './ManageEvents';
import RegistrationsTab from './RegistrationsTab';

function Overview({ ev }) {
  return (
    <Row className="g-3">
      <Col lg={7}>
        <Panel title="Event details" icon="info-circle" actions={!['COMPLETED', 'CANCELLED'].includes(ev.status) && <Button size="sm" variant="light" as={Link} to={`/manage/events/${ev.id}/edit`}><i className="bi bi-pencil-square me-1" />Edit</Button>}>
          <dl className="pass-facts" style={{ fontSize: '.9rem' }}>
            <dt>When</dt><dd>{fmtRange(ev.startsAt, ev.endsAt)}</dd>
            <dt>Venue</dt><dd>{ev.venue.name}</dd>
            <dt>Category</dt><dd>{CATEGORIES[ev.category].label}</dd>
            <dt>Mode</dt><dd>{MODES[ev.mode].label}</dd>
            {ev.mode !== 'AUTO_ASSIGN' && <><dt>Registration</dt><dd>{fmtDateTime(ev.regOpensAt)} → {fmtDateTime(ev.regClosesAt)}</dd></>}
            <dt>Eligibility</dt><dd>{eligibilitySummary(ev.eligibility)}</dd>
            <dt>Organizers</dt><dd>{ev.organizers.map((o) => o.name).join(', ')}</dd>
            <dt>Gates</dt><dd>{ev.gates.map((g) => g.name).join(', ') || <span className="text-danger">none yet</span>}</dd>
          </dl>
          {ev.cancelReason && <p className="small text-danger mt-3 mb-0"><i className="bi bi-x-octagon me-1" />Cancelled: {ev.cancelReason}</p>}
        </Panel>
      </Col>
      <Col lg={5}>
        <Panel title="Registration summary" icon="clipboard-data">
          <dl className="pass-facts" style={{ fontSize: '.9rem' }}>
            <dt>Capacity</dt><dd>{ev.stats.capacity}</dd>
            <dt>Confirmed</dt><dd>{ev.stats.confirmed} ({pct(ev.stats.confirmed, ev.stats.capacity)}%)</dd>
            <dt>Pending</dt><dd>{ev.stats.pending}</dd>
            <dt>Waitlisted</dt><dd>{ev.stats.waitlisted}</dd>
            <dt>Not approved</dt><dd>{ev.stats.rejected}</dd>
            <dt>Cancelled</dt><dd>{ev.stats.cancelled}</dd>
            <dt>Entered</dt><dd>{ev.stats.entered}</dd>
          </dl>
          <p className="small-2 text-muted-2 mt-2 mb-0">Attendance reports and charts come with objective 4–5.</p>
        </Panel>
      </Col>
    </Row>
  );
}

function GatesTab({ ev, reload }) {
  const security = useApi('/manage/security-staff');
  const locked = ['COMPLETED', 'CANCELLED'].includes(ev.status);
  if (!ev.gates.length) {
    return <EmptyState icon="door-closed" title="No gates for this event" action={!locked && <Button as={Link} to={`/manage/events/${ev.id}/edit`}>Add gates</Button>}>Choose entry gates in step 5 of the event editor.</EmptyState>;
  }
  const toggle = async (g, uid) => {
    const current = g.staff.map((s) => s.id);
    const userIds = current.includes(uid) ? current.filter((x) => x !== uid) : [...current, uid];
    if (await attempt(() => api(`/manage/events/${ev.id}/gates/${g.gateId}/staff`, { method: 'PUT', body: { userIds } }), 'Gate staff updated.')) reload();
  };
  return (
    <Row className="g-3">
      {(ev.gateStaff || []).map((g) => (
        <Col md={6} key={g.gateId}>
          <Panel title={g.gateName} icon="door-open" className="h-100" actions={<Tag tone={g.staff.length ? 'success' : 'danger'} icon={g.staff.length ? 'shield-check' : 'shield-exclamation'}>{g.staff.length ? `${g.staff.length} staff` : 'Unstaffed'}</Tag>}>
            <div className="small text-muted-2 mb-2">{g.entered} entries recorded at this gate</div>
            <div className="small fw-600 mb-1">Security staff allowed to scan here</div>
            {!security.data ? <Loading /> : (
              <div className="d-flex flex-wrap gap-2">
                {security.data.map((u) => (
                  <button key={u.id} type="button" className="toggle-chip" aria-pressed={g.staff.some((s) => s.id === u.id)} onClick={() => toggle(g, u.id)} disabled={locked}>{u.name}</button>
                ))}
                {!security.data.length && <span className="small text-muted-2">No security accounts yet — an admin can create them in Users &amp; Roles.</span>}
              </div>
            )}
          </Panel>
        </Col>
      ))}
      <Col xs={12}>
        <p className="small text-muted-2 mb-0"><i className="bi bi-info-circle me-1" />Only staff listed on a gate can scan there. Organizers and admins can scan at any gate of their events.</p>
      </Col>
    </Row>
  );
}

const TABS = [['overview', 'Overview', 'info-circle'], ['registrations', 'Registrations', 'people'], ['gates', 'Gates & security', 'door-open']];

export default function EventManage() {
  const { id } = useParams();
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  const res = useApi(`/manage/events/${id}`);
  const ev = res.data;
  useTitle(ev ? `Manage · ${ev.title}` : 'Event');
  if (res.error && !ev) return <EmptyState icon="calendar-x" title="Event not available" action={<Button as={Link} to="/manage/events">Back to events</Button>}>{res.error.message}</EmptyState>;
  if (!ev) return <Loading />;
  const st = ev.stats;
  const phase = eventPhase(ev);

  return (
    <>
      <PageHeader
        title={ev.title}
        crumbs={[{ label: user.role === 'ADMIN' ? 'All events' : 'My events', to: '/manage/events' }]}
        subtitle={<span className="d-flex flex-wrap gap-2 align-items-center">{phase === 'LIVE' ? <Tag tone="danger" icon="broadcast">Live now</Tag> : <StatusBadge kind="event" status={ev.status} />}<ModeBadge mode={ev.mode} /><span className="small">{fmtRange(ev.startsAt, ev.endsAt)} · {ev.venue.name}</span></span>}
        actions={<><Button variant="light" as={Link} to={`/events/${ev.id}`}><i className="bi bi-eye me-1" />Student view</Button>{phase === 'LIVE' && <Button variant="brand" as={Link} to={`/scan?event=${ev.id}`}><i className="bi bi-upc-scan me-1" />Scanner</Button>}<EventActionsMenu e={ev} onDone={(r) => (r ? res.setData(r) : null)} /></>}
      />
      <Row className="g-3 mb-3">
        <Col xs={6} md={3}><StatTile icon="check-circle" label="Confirmed" value={`${st.confirmed}/${st.capacity}`} hint={`${pct(st.confirmed, st.capacity)}% full`} tone="success" /></Col>
        <Col xs={6} md={3}><StatTile icon="hourglass-split" label="Pending" value={st.pending} tone="warning" to={`/manage/events/${ev.id}?tab=registrations`} /></Col>
        <Col xs={6} md={3}><StatTile icon="list-ol" label="Waitlisted" value={st.waitlisted} tone="info" /></Col>
        <Col xs={6} md={3}><StatTile icon="door-open" label="Entered" value={st.entered} hint={st.confirmed ? `${pct(st.entered, st.confirmed)}% of confirmed` : null} tone="brand" /></Col>
      </Row>
      <Nav variant="tabs" activeKey={tab} onSelect={(k) => setParams({ tab: k })} className="mb-3">
        {TABS.map(([k, label, icon]) => (
          <Nav.Item key={k}><Nav.Link eventKey={k}><i className={`bi bi-${icon} me-1`} aria-hidden="true" />{label}{k === 'registrations' && st.pending > 0 && <span className="notif-count ms-1">{st.pending}</span>}</Nav.Link></Nav.Item>
        ))}
      </Nav>
      {tab === 'overview' && <Overview ev={ev} />}
      {tab === 'registrations' && <RegistrationsTab ev={ev} onChange={res.reload} />}
      {tab === 'gates' && <GatesTab ev={ev} reload={res.reload} />}
    </>
  );
}
