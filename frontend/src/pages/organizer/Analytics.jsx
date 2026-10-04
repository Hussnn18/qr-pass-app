import { useState } from 'react';
import { Col, Form, ProgressBar, Row, Table } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useStore } from '../../store/store';
import { useCurrentUser } from '../../store/session';
import { managedEvents } from '../../store/selectors';
import { checkinsByDay, deptBreakdown, popularity, semesterBreakdown, statusBreakdown, userTypeSplit } from '../../utils/analytics';
import { fmtDateShort, pct } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { PageHeader, Panel, StatTile, StatusBadge } from '../../components/ui';
import { CompareBars, Donut, TrendLines } from '../../components/Charts';

const RANGES = { 30: 'Last 30 days', 90: 'Last 90 days', all: 'All time' };

export default function Analytics() {
  useTitle('Analytics');
  const s = useStore();
  const user = useCurrentUser();
  const [eventId, setEventId] = useState('');
  const [range, setRange] = useState('all');
  const now = Date.now();
  const scope = managedEvents(s, user)
    .filter((e) => e.status !== 'DRAFT')
    .filter((e) => range === 'all' || e.startsAt > now - Number(range) * 864e5)
    .filter((e) => !eventId || e.id === eventId);
  const ids = scope.map((e) => e.id);
  const set = new Set(ids);
  const regs = s.registrations.filter((r) => set.has(r.eventId));
  const live = regs.filter((r) => r.status !== 'CANCELLED' && r.status !== 'REJECTED');
  const approved = regs.filter((r) => r.status === 'APPROVED').length;
  const attended = s.attendance.filter((a) => set.has(a.eventId)).length;
  const pastApproved = regs.filter((r) => r.status === 'APPROVED' && s.events.find((e) => e.id === r.eventId)?.endsAt < now).length;
  const pastAttended = s.attendance.filter((a) => set.has(a.eventId) && s.events.find((e) => e.id === a.eventId)?.endsAt < now).length;
  const pop = popularity(s, scope);

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle={user.role === 'ADMIN' ? 'Participation across all events on the platform.' : 'Participation across the events you organise.'}
        actions={<Link to="/reports" className="btn btn-outline-primary"><i className="bi bi-download me-1" />Export reports</Link>}
      />
      <Panel className="mb-3">
        <div className="filter-bar">
          <Form.Select value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label="Event" style={{ maxWidth: 360 }}>
            <option value="">All events ({managedEvents(s, user).filter((e) => e.status !== 'DRAFT').length})</option>
            {managedEvents(s, user).filter((e) => e.status !== 'DRAFT').sort((a, b) => b.startsAt - a.startsAt).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </Form.Select>
          <Form.Select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Date range" disabled={!!eventId}>
            {Object.entries(RANGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Form.Select>
          <span className="small text-muted-2 ms-auto">{scope.length} event{scope.length === 1 ? '' : 's'} in scope</span>
        </div>
      </Panel>

      <Row className="g-3 mb-3">
        <Col xs={6} lg={3}><StatTile icon="people" label="Registrations" value={live.length} hint={`${regs.length - live.length} cancelled / rejected`} tone="primary" /></Col>
        <Col xs={6} lg={3}><StatTile icon="check-circle" label="Confirmed seats" value={approved} tone="success" /></Col>
        <Col xs={6} lg={3}><StatTile icon="door-open" label="Check-ins" value={attended} tone="brand" /></Col>
        <Col xs={6} lg={3}><StatTile icon="graph-up-arrow" label="Attendance (past events)" value={`${pct(pastAttended, pastApproved)}%`} hint={`${Math.max(pastApproved - pastAttended, 0)} no-shows`} tone="warning" /></Col>
      </Row>

      <Row className="g-3">
        <Col lg={8}><Panel title="Department-wise participation" icon="diagram-3"><CompareBars data={deptBreakdown(s, ids)} height={280} /></Panel></Col>
        <Col lg={4}><Panel title="Registration outcomes" icon="pie-chart"><Donut data={statusBreakdown(s, ids)} height={280} /></Panel></Col>
        <Col lg={8}><Panel title="Semester-wise participation" icon="mortarboard"><CompareBars data={semesterBreakdown(s, ids)} /></Panel></Col>
        <Col lg={4}><Panel title="Students vs guests" icon="globe2"><Donut data={userTypeSplit(s, ids)} /></Panel></Col>
        <Col xs={12}><Panel title="Registrations and check-ins — last 14 days" icon="graph-up"><TrendLines data={checkinsByDay(s, ids, 14)} /></Panel></Col>
        <Col xs={12}>
          <Panel title="Event popularity" icon="trophy" flush>
            <Table hover responsive className="mb-0 align-middle table-stack">
              <thead><tr><th>#</th><th>Event</th><th>Date</th><th>Registrations</th><th>Fill rate</th><th>Attendance</th><th>Status</th></tr></thead>
              <tbody>
                {pop.map((r, i) => (
                  <tr key={r.id}>
                    <td data-label="Rank">{i + 1}</td>
                    <td className="td-main"><Link to={`/manage/events/${r.id}?tab=analytics`} className="fw-600 text-decoration-none">{r.name}</Link></td>
                    <td data-label="Date">{fmtDateShort(r.startsAt)}</td>
                    <td data-label="Registrations">{r.registrations}</td>
                    <td data-label="Fill rate" style={{ minWidth: 140 }}>
                      <div className="small-2">{r.fill}% <span className="text-muted-2">({r.approved}/{r.capacity})</span></div>
                      <ProgressBar now={r.fill} style={{ height: 5 }} aria-label={`${r.fill}% fill`} />
                    </td>
                    <td data-label="Attendance">{r.attended ? `${r.attendanceRate}% (${r.attended})` : '—'}</td>
                    <td data-label="Status"><StatusBadge kind="event" status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Panel>
        </Col>
      </Row>
    </>
  );
}
