import { useState } from 'react';
import { Button, ButtonGroup, Col, Form, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { download } from '../../api/client';
import { useApi } from '../../api/useApi';
import { useAuth } from '../../auth/AuthContext';
import { fmtDateShort } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { PageHeader, Panel } from '../../components/ui';
import { attempt } from '../../components/feedback';
import { SummaryDownload, useRange } from '../../components/ReportControls';

const KINDS = {
  attendance: { label: 'Attendance', icon: 'door-open', desc: 'Everyone who entered, with time, gate, how they were recorded and by whom.' },
  absentees: { label: 'Absentees / no-shows', icon: 'person-x', desc: 'Confirmed participants who never entered, with contact details.' },
  registrations: { label: 'All registrations', icon: 'people', desc: 'Every registration with status, timestamps, pass and entry.' },
};
const FORMATS = [['xlsx', 'Excel', 'file-earmark-spreadsheet'], ['pdf', 'PDF', 'file-earmark-pdf'], ['csv', 'CSV', 'filetype-csv']];

/** Report downloads (objective 5). Every download is recorded in the audit log. */
export default function Reports() {
  useTitle('Reports');
  const { user } = useAuth();
  const events = useApi('/manage/events');
  const usable = (events.data || []).filter((e) => e.status !== 'DRAFT').sort((a, b) => b.startsAt - a.startsAt);
  const [eventId, setEventId] = useState('');
  const [kind, setKind] = useState('attendance');
  const { range, picker } = useRange();
  const chosen = eventId || usable[0]?.id || '';

  const get = (format) => attempt(() => download(`/manage/reports/events/${chosen}/${kind}?format=${format}`, `${kind}.${format}`));

  return (
    <>
      <PageHeader title="Reports" subtitle="Download attendance and participation reports as Excel, PDF or CSV. Every download is recorded in the audit log."
        actions={<Button as={Link} to="/analytics" variant="light"><i className="bi bi-bar-chart-line me-1" />Analytics</Button>} />
      <Row className="g-3">
        <Col lg={7}>
          <Panel title="One event" icon="calendar-event">
            {!usable.length ? <p className="small text-muted-2 mb-0">{events.data ? 'No published events yet.' : 'Loading events…'}</p> : (
              <>
                <Form.Group controlId="rep-event" className="mb-3">
                  <Form.Label>Event</Form.Label>
                  <Form.Select value={chosen} onChange={(e) => setEventId(e.target.value)}>
                    {usable.map((e) => <option key={e.id} value={e.id}>{e.title} — {fmtDateShort(e.startsAt)}</option>)}
                  </Form.Select>
                </Form.Group>
                <div className="d-grid gap-2 mb-3" role="radiogroup" aria-label="Report">
                  {Object.entries(KINDS).map(([k, v]) => (
                    <label key={k} className={`choice-card d-flex align-items-start text-start ${kind === k ? 'selected' : ''}`}>
                      <Form.Check type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} className="me-2" aria-label={v.label} />
                      <i className={`bi bi-${v.icon} me-2`} aria-hidden="true" />
                      <span><span className="fw-600">{v.label}</span><span className="d-block small-2 text-muted-2">{v.desc}</span></span>
                    </label>
                  ))}
                </div>
                <ButtonGroup>
                  {FORMATS.map(([f, label, icon]) => <Button key={f} variant={f === 'xlsx' ? 'brand' : 'outline-primary'} onClick={() => get(f)}><i className={`bi bi-${icon} me-1`} />{label}</Button>)}
                </ButtonGroup>
              </>
            )}
          </Panel>
        </Col>
        <Col lg={5} className="section-gap">
          <Panel title="Summary across events" icon="table">
            <p className="small text-muted-2">One row per event with registrations, attendance, no-shows and fill rate, plus department-, semester- and category-wise totals.{user.role === 'ORGANIZER' && ' Only the events you organise are included.'}</p>
            <div className="mb-3">{picker}</div>
            <SummaryDownload range={range} variant="brand" size={undefined} />
          </Panel>
          {user.role === 'ADMIN' && (
            <Panel title="Audit log" icon="journal-text">
              <p className="small text-muted-2">Sign-ins, account and role changes, imports, approvals, cancellations, manual entries and report downloads.</p>
              <Button as={Link} to="/admin/audit" variant="outline-primary"><i className="bi bi-journal-text me-1" />Open the audit log</Button>
            </Panel>
          )}
        </Col>
      </Row>
    </>
  );
}
