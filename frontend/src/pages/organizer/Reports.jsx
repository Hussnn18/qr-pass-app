import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Alert, Button, Col, Form, Row, Table } from 'react-bootstrap';
import { useStore } from '../../store/store';
import { useCurrentUser } from '../../store/session';
import { byId, eventStats, managedEvents } from '../../store/selectors';
import { logExport } from '../../store/actions';
import { fmtDateShort, fmtDateTime, fmtTime } from '../../utils/format';
import { downloadText, toCSV } from '../../utils/files';
import { useTitle } from '../../utils/hooks';
import { PageHeader, Panel } from '../../components/ui';
import { toast } from '../../components/feedback';

const TYPES = {
  registrations: { label: 'Registrations', icon: 'people', desc: 'Everyone who registered, with status and timestamps.' },
  attendance: { label: 'Attendance', icon: 'door-open', desc: 'Check-ins with gate, time and method.' },
  noshows: { label: 'No-shows', icon: 'person-x', desc: 'Confirmed participants who never checked in.' },
  summary: { label: 'Event summary', icon: 'table', desc: 'One row per event with key numbers.' },
};

export default function Reports() {
  useTitle('Export reports');
  const s = useStore();
  const user = useCurrentUser();
  const events = managedEvents(s, user).filter((e) => e.status !== 'DRAFT').sort((a, b) => b.startsAt - a.startsAt);
  const [type, setType] = useState('attendance');
  const [eventId, setEventId] = useState(events.find((e) => s.attendance.some((a) => a.eventId === e.id))?.id || events[0]?.id || '');
  const [format, setFormat] = useState('csv');
  const [printing, setPrinting] = useState(false);
  const ev = byId(s.events, eventId);

  const { columns, rows } = useMemo(() => {
    const person = (uid) => byId(s.users, uid);
    if (type === 'summary') {
      return {
        columns: [
          { label: 'Event', value: (e) => e.title }, { label: 'Date', value: (e) => fmtDateShort(e.startsAt) }, { label: 'Status', value: (e) => e.status },
          { label: 'Capacity', value: (e) => e.capacity }, { label: 'Confirmed', value: (e) => eventStats(s, e.id).approved },
          { label: 'Checked in', value: (e) => eventStats(s, e.id).attended }, { label: 'Attendance %', value: (e) => eventStats(s, e.id).attendanceRate },
        ],
        rows: events,
      };
    }
    const base = [
      { label: 'Name', value: (x) => person(x.userId)?.name }, { label: 'URN / Email', value: (x) => person(x.userId)?.urn || person(x.userId)?.email },
      { label: 'Department', value: (x) => person(x.userId)?.dept || person(x.userId)?.organization || '' }, { label: 'Semester', value: (x) => person(x.userId)?.semester || '' },
    ];
    if (type === 'attendance') {
      return {
        columns: [...base, { label: 'Gate', value: (a) => byId(s.gates, a.gateId)?.name }, { label: 'Time', value: (a) => fmtTime(a.at) }, { label: 'Method', value: (a) => a.method }, { label: 'Scanned by', value: (a) => person(a.by)?.name || '' }],
        rows: s.attendance.filter((a) => a.eventId === eventId).sort((a, b) => a.at - b.at),
      };
    }
    if (type === 'noshows') {
      return {
        columns: [...base, { label: 'Phone', value: (r) => person(r.userId)?.phone || '' }],
        rows: s.registrations.filter((r) => r.eventId === eventId && r.status === 'APPROVED' && !s.attendance.some((a) => a.registrationId === r.id)),
      };
    }
    return {
      columns: [...base, { label: 'Status', value: (r) => r.status }, { label: 'Registered', value: (r) => fmtDateTime(r.registeredAt) }],
      rows: s.registrations.filter((r) => r.eventId === eventId),
    };
  }, [s, type, eventId, events]);

  const name = `${type === 'summary' ? 'All events' : ev?.title} - ${TYPES[type].label}`;
  const download = () => {
    if (format === 'pdf') {
      setPrinting(true);
      document.body.classList.add('printing');
      setTimeout(() => { window.print(); document.body.classList.remove('printing'); setPrinting(false); }, 150);
    } else {
      downloadText(`${name}.csv`, toCSV(rows, columns));
      if (format === 'xlsx') toast.info('The prototype saves Excel exports as CSV, which Excel opens directly. The real backend generates .xlsx with Apache POI.');
    }
    logExport(`${name} · ${format.toUpperCase()} · ${rows.length} rows`);
  };
  const table = (limit) => (
    <Table size="sm" bordered responsive className="mb-0 small">
      <thead><tr>{columns.map((c) => <th key={c.label}>{c.label}</th>)}</tr></thead>
      <tbody>{rows.slice(0, limit).map((r, i) => <tr key={r.id || i}>{columns.map((c) => <td key={c.label}>{c.value(r)}</td>)}</tr>)}</tbody>
    </Table>
  );

  return (
    <>
      <PageHeader title="Export reports" subtitle="Download attendance and registration lists for HODs, the Training & Placement Cell, or your records." />
      <Row className="g-3">
        <Col lg={4}>
          <Panel title="Report options" icon="sliders">
            <Form.Label as="div">Report</Form.Label>
            <div className="d-grid gap-2 mb-3">
              {Object.entries(TYPES).map(([k, t]) => (
                <button key={k} type="button" className={`choice-card ${type === k ? 'selected' : ''}`} onClick={() => setType(k)} aria-pressed={type === k}>
                  <i className={`bi bi-${t.icon}`} aria-hidden="true" />
                  <span><span className="fw-600 d-block">{t.label}</span><span className="small-2 text-muted-2">{t.desc}</span></span>
                </button>
              ))}
            </div>
            {type !== 'summary' && (
              <Form.Group controlId="rp-ev" className="mb-3"><Form.Label>Event</Form.Label>
                <Form.Select value={eventId} onChange={(e) => setEventId(e.target.value)}>{events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</Form.Select>
              </Form.Group>
            )}
            <Form.Label as="div">Format</Form.Label>
            <div className="d-flex gap-3 mb-3">
              {[['csv', 'CSV'], ['xlsx', 'Excel'], ['pdf', 'PDF']].map(([k, l]) => <Form.Check key={k} type="radio" id={`fmt-${k}`} name="fmt" label={l} checked={format === k} onChange={() => setFormat(k)} />)}
            </div>
            <Button className="w-100" onClick={download} disabled={!rows.length}><i className="bi bi-download me-1" />Download {rows.length} row{rows.length === 1 ? '' : 's'}</Button>
            <p className="small-2 text-muted-2 mt-2 mb-0">Every export is written to the audit log.</p>
          </Panel>
        </Col>
        <Col lg={8}>
          <Panel title={`Preview — ${name}`} icon="table" actions={<span className="small text-muted-2">First 12 of {rows.length}</span>}>
            {rows.length ? table(12) : <Alert variant="light" className="border small mb-0">No rows for this selection.</Alert>}
          </Panel>
        </Col>
      </Row>
      {printing && createPortal(
        <div className="print-area">
          <h2 style={{ fontSize: 16 }}>GNDEC Ludhiana — {name}</h2>
          <p style={{ fontSize: 11 }}>Generated {fmtDateTime(Date.now())} by {user.name} · {rows.length} rows</p>
          {table(rows.length)}
        </div>,
        document.body,
      )}
    </>
  );
}
