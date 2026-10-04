import { useEffect, useState } from 'react';
import { Button, Col, Form, Nav, Row } from 'react-bootstrap';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { CATEGORIES, MODES } from '../../data/constants';
import { useStore } from '../../store/store';
import { useCurrentUser } from '../../store/session';
import { byId, canManage, eventStats, gatesForEvent } from '../../store/selectors';
import { setAssignments } from '../../store/actions';
import { eligibilitySummary, eventPhase } from '../../utils/eligibility';
import { fmtDateTime, fmtRange, pct } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { deptBreakdown, entryTimeline, gateBreakdown, semesterBreakdown, statusBreakdown, userTypeSplit } from '../../utils/analytics';
import { randomToken } from '../../utils/ids';
import { EmptyState, ModeBadge, PageHeader, Panel, StatTile, StatusBadge, Tag } from '../../components/ui';
import { CompareBars, Donut, EntriesTimeline } from '../../components/Charts';
import { toast } from '../../components/feedback';
import { EventActionsMenu } from './ManageEvents';
import RegistrationsTab from './RegistrationsTab';
import LiveTab from './LiveTab';

function Overview({ ev, s }) {
  const st = eventStats(s, ev.id);
  const venue = byId(s.locations, ev.venueId);
  return (
    <Row className="g-3">
      <Col lg={7}>
        <Panel title="Event details" icon="info-circle" actions={!['COMPLETED', 'CANCELLED'].includes(ev.status) && <Button size="sm" variant="light" as={Link} to={`/manage/events/${ev.id}/edit`}><i className="bi bi-pencil-square me-1" />Edit</Button>}>
          <dl className="pass-facts" style={{ fontSize: '.9rem' }}>
            <dt>When</dt><dd>{fmtRange(ev.startsAt, ev.endsAt)}</dd>
            <dt>Venue</dt><dd><Link to={`/campus?loc=${venue?.id}`}>{venue?.name}</Link></dd>
            <dt>Category</dt><dd>{CATEGORIES[ev.category].label}</dd>
            <dt>Mode</dt><dd>{MODES[ev.mode].label}</dd>
            {ev.mode !== 'AUTO_ASSIGN' && <><dt>Registration</dt><dd>{fmtDateTime(ev.regOpensAt)} → {fmtDateTime(ev.regClosesAt)}</dd></>}
            <dt>Eligibility</dt><dd>{eligibilitySummary(ev)}</dd>
            <dt>Organizers</dt><dd>{ev.organizerIds.map((o) => byId(s.users, o)?.name).join(', ')}</dd>
            <dt>Created</dt><dd>{fmtDateTime(ev.createdAt)}</dd>
          </dl>
          {ev.cancelReason && <p className="small text-danger mt-3 mb-0"><i className="bi bi-x-octagon me-1" />Cancelled: {ev.cancelReason}</p>}
        </Panel>
      </Col>
      <Col lg={5}>
        <Panel title="Status breakdown" icon="pie-chart">
          <Donut data={statusBreakdown(s, [ev.id])} height={240} />
          <div className="small text-muted-2 text-center">Fill rate {st.fill}% · attendance {st.attendanceRate}%</div>
        </Panel>
      </Col>
    </Row>
  );
}

function AnalyticsTab({ ev, s }) {
  const st = eventStats(s, ev.id);
  return (
    <div className="section-gap">
      <Row className="g-3">
        <Col xs={6} lg={3}><StatTile icon="people" label="Registered" value={st.active} tone="primary" /></Col>
        <Col xs={6} lg={3}><StatTile icon="check-circle" label="Fill rate" value={`${st.fill}%`} hint={`${st.approved}/${st.capacity}`} tone="success" /></Col>
        <Col xs={6} lg={3}><StatTile icon="door-open" label="Attendance rate" value={`${st.attendanceRate}%`} hint={`${st.attended} checked in`} tone="brand" /></Col>
        <Col xs={6} lg={3}><StatTile icon="person-x" label="No-shows" value={st.noShow} hint={st.noShow ? 'after event end' : 'counted after the event'} tone="warning" /></Col>
      </Row>
      <Row className="g-3">
        <Col lg={7}><Panel title="Department-wise participation" icon="diagram-3"><CompareBars data={deptBreakdown(s, [ev.id])} /></Panel></Col>
        <Col lg={5}><Panel title="Students vs guests" icon="people"><Donut data={userTypeSplit(s, [ev.id])} /></Panel></Col>
        <Col lg={6}><Panel title="Semester-wise participation" icon="mortarboard"><CompareBars data={semesterBreakdown(s, [ev.id])} /></Panel></Col>
        <Col lg={6}><Panel title="Gate-wise entries" icon="door-open"><CompareBars data={gateBreakdown(s, ev.id)} keys={[['entries', 'Entries'], ['rejected', 'Rejected scans']]} /></Panel></Col>
        <Col xs={12}><Panel title="Entries over time (10-minute slots)" icon="graph-up"><EntriesTimeline data={entryTimeline(s, ev.id)} /></Panel></Col>
      </Row>
    </div>
  );
}

function PairingCard({ ev, gate, staff }) {
  const [code, setCode] = useState(() => randomToken().slice(0, 12));
  const [left, setLeft] = useState(300);
  useEffect(() => {
    const t = setInterval(() => setLeft((x) => {
      if (x <= 1) { setCode(randomToken().slice(0, 12)); return 300; }
      return x - 1;
    }), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-center">
      <div className="d-inline-block p-2 border rounded bg-white"><QRCodeSVG value={`EQR-PAIR:${ev.id}:${gate.id}:${code}`} size={150} level="M" marginSize={1} title="Scanner pairing QR" /></div>
      <div className="small mt-2">Expires in <strong>{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</strong> · single use</div>
      <div className="small-2 text-muted-2">{staff.length ? `For ${staff.join(', ')}` : 'Assign staff first'}</div>
    </div>
  );
}

function GatesTab({ ev, s }) {
  const gates = gatesForEvent(s, ev);
  const security = s.users.filter((u) => u.role === 'SECURITY' && u.status === 'ACTIVE');
  const [pairGate, setPairGate] = useState(null);
  const locked = ['COMPLETED', 'CANCELLED'].includes(ev.status);
  if (!gates.length) {
    return <EmptyState icon="door-closed" title="No gates for this event" action={!locked && <Button as={Link} to={`/manage/events/${ev.id}/edit`}>Add gates</Button>}>Choose entry gates in step 5 of the event editor.</EmptyState>;
  }
  return (
    <Row className="g-3">
      {gates.map((g) => {
        const assigned = s.assignments.filter((a) => a.eventId === ev.id && a.gateId === g.id).map((a) => a.userId);
        const entries = s.attendance.filter((a) => a.eventId === ev.id && a.gateId === g.id).length;
        const toggle = (uid) => toast.result(setAssignments(ev.id, g.id, assigned.includes(uid) ? assigned.filter((x) => x !== uid) : [...assigned, uid]));
        return (
          <Col md={6} key={g.id}>
            <Panel title={g.name} icon="door-open" className="h-100" actions={<Tag tone={assigned.length ? 'success' : 'danger'} icon={assigned.length ? 'shield-check' : 'shield-exclamation'}>{assigned.length ? `${assigned.length} staff` : 'Unstaffed'}</Tag>}>
              <div className="small text-muted-2 mb-2">{entries} entries recorded</div>
              <Form.Label as="div" className="small">Security staff</Form.Label>
              <div className="d-flex flex-wrap gap-2 mb-3">
                {security.map((u) => (
                  <button key={u.id} type="button" className="toggle-chip" aria-pressed={assigned.includes(u.id)} onClick={() => toggle(u.id)} disabled={locked}>{u.name}</button>
                ))}
              </div>
              {pairGate === g.id ? (
                <PairingCard ev={ev} gate={g} staff={assigned.map((a) => byId(s.users, a)?.name)} />
              ) : (
                <Button size="sm" variant="outline-primary" onClick={() => setPairGate(g.id)} disabled={locked || !assigned.length}><i className="bi bi-qr-code me-1" />Show scanner pairing QR</Button>
              )}
            </Panel>
          </Col>
        );
      })}
      <Col xs={12}>
        <p className="small text-muted-2 mb-0"><i className="bi bi-info-circle me-1" />The pairing QR lets a staff phone open the scanner for this gate without typing a password. It is single-use and expires after 5 minutes (replaces the Minor project's permanent shared scanner token).</p>
      </Col>
    </Row>
  );
}

const TABS = [['overview', 'Overview', 'info-circle'], ['registrations', 'Registrations', 'people'], ['live', 'Live attendance', 'broadcast'], ['analytics', 'Analytics', 'bar-chart-line'], ['gates', 'Gates & security', 'door-open']];

export default function EventManage() {
  const { id } = useParams();
  const s = useStore();
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  const ev = byId(s.events, id);
  useTitle(ev ? `Manage · ${ev.title}` : 'Event');
  if (!ev || !canManage(user, ev)) {
    return <EmptyState icon="calendar-x" title="Event not found" action={<Button as={Link} to="/manage/events">Back to events</Button>}>It may have been deleted, or you're not one of its organizers.</EmptyState>;
  }
  const st = eventStats(s, ev.id);
  const phase = eventPhase(ev);

  return (
    <>
      <PageHeader
        title={ev.title}
        crumbs={[{ label: user.role === 'ADMIN' ? 'All events' : 'My events', to: '/manage/events' }]}
        subtitle={<span className="d-flex flex-wrap gap-2 align-items-center">{phase === 'LIVE' ? <Tag tone="danger" icon="broadcast">Live now</Tag> : <StatusBadge kind="event" status={ev.status} />}<ModeBadge mode={ev.mode} /><span className="small">{fmtRange(ev.startsAt, ev.endsAt)} · {byId(s.locations, ev.venueId)?.name}</span></span>}
        actions={<><Button variant="light" as={Link} to={`/events/${ev.id}`}><i className="bi bi-eye me-1" />Participant view</Button><EventActionsMenu e={ev} /></>}
      />
      <Row className="g-3 mb-3">
        <Col xs={6} md={3}><StatTile icon="check-circle" label="Confirmed" value={`${st.approved}/${ev.capacity}`} hint={`${st.fill}% full`} tone="success" /></Col>
        <Col xs={6} md={3}><StatTile icon="hourglass-split" label="Pending" value={st.pending} tone="warning" to={`/manage/events/${ev.id}?tab=registrations`} /></Col>
        <Col xs={6} md={3}><StatTile icon="list-ol" label="Waitlisted" value={st.waitlisted} tone="info" /></Col>
        <Col xs={6} md={3}><StatTile icon="door-open" label="Checked in" value={st.attended} hint={st.approved ? `${pct(st.attended, st.approved)}% of confirmed` : null} tone="brand" to={`/manage/events/${ev.id}?tab=live`} /></Col>
      </Row>
      <Nav variant="tabs" activeKey={tab} onSelect={(k) => setParams({ tab: k })} className="mb-3">
        {TABS.map(([k, label, icon]) => (
          <Nav.Item key={k}><Nav.Link eventKey={k}><i className={`bi bi-${icon} me-1`} aria-hidden="true" />{label}{k === 'registrations' && st.pending > 0 && <span className="notif-count ms-1">{st.pending}</span>}{k === 'live' && phase === 'LIVE' && <span className="text-danger ms-1">●</span>}</Nav.Link></Nav.Item>
        ))}
      </Nav>
      {tab === 'overview' && <Overview ev={ev} s={s} />}
      {tab === 'registrations' && <RegistrationsTab ev={ev} />}
      {tab === 'live' && <LiveTab ev={ev} />}
      {tab === 'analytics' && <AnalyticsTab ev={ev} s={s} />}
      {tab === 'gates' && <GatesTab ev={ev} s={s} />}
    </>
  );
}
