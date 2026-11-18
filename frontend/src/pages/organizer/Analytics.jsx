import { Button, Col, ProgressBar, Row, Table } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { qs } from '../../api/client';
import { useApi } from '../../api/useApi';
import { useAuth } from '../../auth/AuthContext';
import { CATEGORIES, REG_STATUS } from '../../data/constants';
import { fmtDateShort } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { Async, PageHeader, Panel, StatTile, Tag } from '../../components/ui';
import { SummaryDownload, useRange } from '../../components/ReportControls';
import { CHART_COLORS, CompareBars, Donut, TrendLines } from '../../components/Charts';

const STATUS_COLORS = { CONFIRMED: '#1f7a4d', PENDING: '#b98b2e', WAITLISTED: '#0f6f86', REJECTED: '#c0282d', CANCELLED: '#9aa0aa' };
const PHASE_TAG = { UPCOMING: ['Upcoming', 'info'], OPEN: ['Live', 'danger'], ENDED: ['Ended', 'secondary'], CANCELLED: ['Cancelled', 'danger'] };

/** Dashboards (objective 5): participation across all events (admin) or the organizer's own events. */
export default function Analytics() {
  useTitle('Analytics');
  const { user } = useAuth();
  const { range, picker, label } = useRange();
  const res = useApi(`/manage/analytics${qs(range)}`);

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle={user.role === 'ADMIN' ? 'Participation across every event on the platform.' : 'Participation across the events you organise.'}
        actions={<><Button as={Link} to="/reports" variant="light"><i className="bi bi-file-earmark-spreadsheet me-1" />All reports</Button><SummaryDownload range={range} variant="brand" size={undefined} /></>}
      />
      <Panel className="mb-3">
        <div className="filter-bar">
          {picker}
          {res.data && <span className="small text-muted-2 ms-auto">{res.data.kpis.events} event{res.data.kpis.events === 1 ? '' : 's'} · {label.toLowerCase()} · by start date · drafts excluded</span>}
        </div>
      </Panel>
      <Async state={res}>
        {(o) => {
          const k = o.kpis;
          const statusData = Object.entries(o.registrationStatus).map(([s, n]) => ({ name: REG_STATUS[s]?.label || s, value: n, color: STATUS_COLORS[s] }));
          const categoryData = o.categories.map((c, i) => ({ name: c.label, value: c.registrations, color: CATEGORIES[c.key]?.color || CHART_COLORS[i] }));
          return (
            <>
              <Row className="g-3 mb-3">
                <Col xs={6} lg><StatTile icon="calendar3" label="Events" value={k.events} hint={`${k.upcoming} upcoming · ${k.running} live · ${k.ended} ended`} tone="primary" /></Col>
                <Col xs={6} lg><StatTile icon="people" label="Registrations" value={k.registrations} hint={`${k.confirmed} confirmed · ${k.waitlisted} waitlisted`} tone="info" /></Col>
                <Col xs={6} lg><StatTile icon="door-open" label="Attended" value={k.attended} hint={`${k.attendanceRate}% of confirmed`} tone="success" /></Col>
                <Col xs={6} lg><StatTile icon="person-x" label="No-shows" value={k.noShows} hint="at events that have ended" tone="danger" /></Col>
                <Col xs={12} lg><StatTile icon="speedometer2" label="Fill rate" value={`${k.fillRate}%`} hint="confirmed seats of capacity" tone="warning" /></Col>
              </Row>
              {!k.events ? (
                <Panel><p className="text-center text-muted-2 my-4">No events in this range yet.</p></Panel>
              ) : (
                <Row className="g-3">
                  <Col lg={8}>
                    <Panel title="Department-wise participation" icon="diagram-3">
                      <CompareBars data={o.departments.map((d) => ({ name: d.key, registrations: d.registrations, confirmed: d.confirmed, attended: d.attended }))}
                        keys={[['registrations', 'Registered'], ['confirmed', 'Confirmed'], ['attended', 'Attended']]} height={280} />
                    </Panel>
                  </Col>
                  <Col lg={4}><Panel title="Registration outcomes" icon="pie-chart"><Donut data={statusData} height={280} /></Panel></Col>
                  <Col lg={8}>
                    <Panel title="Semester-wise participation" icon="mortarboard">
                      <CompareBars data={o.semesters.map((d) => ({ name: `Sem ${d.key}`, registrations: d.registrations, confirmed: d.confirmed, attended: d.attended }))}
                        keys={[['registrations', 'Registered'], ['confirmed', 'Confirmed'], ['attended', 'Attended']]} />
                    </Panel>
                  </Col>
                  <Col lg={4}><Panel title="Registrations by category" icon="tags"><Donut data={categoryData} /></Panel></Col>
                  <Col lg={8}>
                    <Panel title={`Registrations and check-ins per ${o.granularity === 'MONTH' ? 'month' : 'day'}`} icon="graph-up">
                      <TrendLines data={o.trend.map((p) => ({ name: p.label, registrations: p.registrations, checkins: p.checkins }))}
                        lines={[['registrations', 'Registrations'], ['checkins', 'Check-ins']]} />
                    </Panel>
                  </Col>
                  <Col lg={4}>
                    <Panel title="Busiest gates" icon="door-open">
                      <CompareBars data={o.gates.slice(0, 6).map((g) => ({ name: `${g.gateName} · ${g.venueName}`, entries: g.entries }))}
                        keys={[['entries', 'Entries']]} layout="vertical" labelWidth={130} height={260} />
                    </Panel>
                  </Col>
                  <Col xs={12}>
                    <Panel title="Event popularity" icon="trophy" flush actions={<span className="small-2 text-muted-2">Ranked by demand: confirmed + waitlisted against capacity</span>}>
                      <Table hover responsive className="mb-0 align-middle table-stack">
                        <thead><tr><th>#</th><th>Event</th><th>Date</th><th>Registrations</th><th>Fill rate</th><th>Attendance</th><th>Status</th></tr></thead>
                        <tbody>
                          {o.events.map((e, i) => (
                            <tr key={e.id}>
                              <td data-label="Rank">{i + 1}</td>
                              <td className="td-main">
                                <Link to={`/manage/events/${e.id}?tab=attendance`} className="fw-600 text-decoration-none">{e.title}</Link>
                                <div className="small-2 text-muted-2">{CATEGORIES[e.category]?.label} · {e.venueName}</div>
                              </td>
                              <td data-label="Date">{fmtDateShort(e.startsAt)}</td>
                              <td data-label="Registrations">{e.registrations}{e.waitlisted > 0 && <span className="small-2 text-muted-2"> ({e.waitlisted} waiting)</span>}</td>
                              <td data-label="Fill rate" style={{ minWidth: 140 }}>
                                <div className="small-2">{e.fillRate}% <span className="text-muted-2">({e.confirmed}/{e.capacity})</span></div>
                                <ProgressBar now={Math.min(e.fillRate, 100)} style={{ height: 5 }} aria-label={`${e.fillRate}% full`} />
                              </td>
                              <td data-label="Attendance">{e.attendanceRate == null ? '—' : `${e.attendanceRate}% (${e.attended})`}{e.noShows > 0 && <div className="small-2 text-danger">{e.noShows} no-shows</div>}</td>
                              <td data-label="Status"><Tag tone={PHASE_TAG[e.phase]?.[1] || 'secondary'}>{PHASE_TAG[e.phase]?.[0] || e.status}</Tag></td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </Panel>
                  </Col>
                </Row>
              )}
            </>
          );
        }}
      </Async>
    </>
  );
}
