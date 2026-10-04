import { useRef, useState } from 'react';
import { Alert, Button, Col, Form, Row, Table } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { downloadText, toCSV } from '../../utils/files';
import { useTitle } from '../../utils/hooks';
import { PageHeader, Panel, StatTile, Tag } from '../../components/ui';
import { toast } from '../../components/feedback';

const HEADERS = ['URN', 'Name', 'Email', 'Phone', 'Department', 'Semester', 'Section', 'Batch', 'DOB'];
const REQUIRED = ['URN', 'Name', 'Email', 'Department', 'Semester'];
const SAMPLE = [
  HEADERS.join(','),
  '2602401,Aarav Sharma,aarav.2602401@gndec.demo,+91 99999 12001,CSE,1,A,2026,2008-04-11',
  '2602402,Baani Kaur,baani.2602402@gndec.demo,+91 99999 12002,CSE,1,B,2026,2008-09-23',
  '2615403,Chirag Bansal,chirag.2615403@gndec.demo,+91 99999 12003,IT,1,A,2026,2007-12-02',
  '2604404,Diya Arora,,+91 99999 12004,ECE,1,C,2026,2008-01-30',
  '2302511,Duplicate Student,dup.2302511@gndec.demo,,CSE,7,A,2023,2005-03-14',
  '26054,Short URN,short@gndec.demo,,ME,1,A,2026,2008-06-06',
  '2605406,Ekamjot Singh,ekam.2605406@gndec.demo,,XYZ,1,A,2026,2008-02-17',
  '2606407,Fatehbir Gill,fateh.2606407@gndec.demo,,PE,11,A,2026,2004-',
].join('\n');

/** Bulk student import (O2-07): the server checks every row first, then imports the valid ones. */
export default function StudentImport() {
  useTitle('Student import');
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const upload = async (blob, name) => {
    setDone(null);
    setFile(name);
    setBusy(true);
    const form = new FormData();
    form.append('file', blob, name);
    try {
      setPreview(await api('/admin/students/import/preview', { method: 'POST', form }));
    } catch (e) {
      setPreview(null);
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  const onFile = (f) => {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) {
      toast.error('Please upload a .csv file (save the Excel sheet as CSV first).');
      return;
    }
    upload(f, f.name);
  };
  const doImport = async () => {
    setBusy(true);
    try {
      const r = await api('/admin/students/import', { method: 'POST', body: { rows: preview.rows.filter((x) => !x.errors.length) } });
      setDone({ ...r, skipped: r.skipped + preview.invalid });
      setPreview(null);
      setFile(null);
      toast.success(`${r.added} students imported.`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  const downloadCredentials = () => {
    downloadText('student_temporary_passwords.csv', toCSV(done.credentials, [
      { label: 'URN', value: (c) => c.urn }, { label: 'Name', value: (c) => c.name }, { label: 'Email', value: (c) => c.email },
      { label: 'Temporary password', value: (c) => c.tempPassword },
    ]));
  };

  const rows = preview?.rows || [];
  const shown = (onlyErrors ? rows.filter((r) => r.errors.length) : rows).slice(0, 300);

  return (
    <>
      <PageHeader title="Student import" crumbs={[{ label: 'Users & roles', to: '/admin/users' }]} subtitle="Upload a CSV exported from the college ERP. The server checks every row before anything is saved." />
      <Row className="g-3">
        <Col lg={4} className="section-gap">
          <Panel title="1. Upload file" icon="file-earmark-arrow-up">
            <div className={`dropzone ${drag ? 'drag' : ''}`} role="button" tabIndex={0}
              onClick={() => input.current.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files?.[0]); }} aria-label="Choose or drop a CSV file">
              <i className="bi bi-cloud-arrow-up" aria-hidden="true" />
              <div className="fw-600 mt-1">{busy ? 'Checking…' : 'Drop a CSV here or click to browse'}</div>
              <div className="small text-muted-2">{file || 'Up to 5,000 rows'}</div>
            </div>
            <input ref={input} type="file" accept=".csv,text/csv" className="d-none" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
            <div className="d-flex flex-wrap gap-2 mt-3">
              <Button size="sm" variant="light" onClick={() => downloadText('students_sample.csv', SAMPLE)}><i className="bi bi-download me-1" />Sample CSV</Button>
              <Button size="sm" variant="outline-primary" onClick={() => upload(new Blob([SAMPLE], { type: 'text/csv' }), 'students_sample.csv')} disabled={busy}><i className="bi bi-play me-1" />Try the sample</Button>
            </div>
          </Panel>
          <Panel title="Columns" icon="list-check">
            <div className="d-flex flex-wrap gap-1">{HEADERS.map((h) => <Tag key={h} tone={REQUIRED.includes(h) ? 'primary' : 'secondary'}>{h}</Tag>)}</div>
            <p className="small text-muted-2 mt-2 mb-0">Blue columns are required. Every imported student gets a random temporary password and must change it at first sign-in.</p>
          </Panel>
        </Col>
        <Col lg={8}>
          {done && (
            <Alert variant="success">
              <Alert.Heading className="h6 fw-bold"><i className="bi bi-check-circle me-2" />Import complete</Alert.Heading>
              <p className="small mb-2">{done.added} students added · {done.skipped} rows skipped. Download the temporary passwords now — they are not stored anywhere readable and won't be shown again.</p>
              <div className="d-flex gap-2 flex-wrap">
                <Button size="sm" variant="success" onClick={downloadCredentials} disabled={!done.credentials.length}><i className="bi bi-download me-1" />Temporary passwords (CSV)</Button>
                <Button size="sm" as={Link} to="/admin/users?role=STUDENT" variant="outline-success">View students</Button>
              </div>
            </Alert>
          )}
          <Panel title="2. Review & import" icon="table" actions={preview && <Form.Check type="switch" id="only-err" label="Show only problems" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />}>
            {!preview ? (
              <div className="text-center text-muted-2 py-5 small"><i className="bi bi-table fs-2 d-block mb-2" aria-hidden="true" />Upload a file to preview it here.</div>
            ) : (
              <>
                <Row className="g-2 mb-3">
                  <Col xs={4}><StatTile icon="file-text" label="Rows" value={rows.length} tone="primary" /></Col>
                  <Col xs={4}><StatTile icon="check-circle" label="Ready" value={preview.valid} tone="success" /></Col>
                  <Col xs={4}><StatTile icon="exclamation-triangle" label="With problems" value={preview.invalid} tone={preview.invalid ? 'danger' : 'secondary'} /></Col>
                </Row>
                <div style={{ maxHeight: 420, overflow: 'auto' }}>
                  <Table size="sm" hover className="small align-middle mb-0">
                    <thead className="sticky-top"><tr><th>Line</th><th>URN</th><th>Name</th><th>Dept</th><th>Sem</th><th>Email</th><th>Check</th></tr></thead>
                    <tbody>
                      {shown.map((r) => (
                        <tr key={r.line} className={r.errors.length ? 'row-error' : ''}>
                          <td>{r.line}</td><td className="mono">{r.urn}</td><td>{r.name}</td><td>{r.dept}</td><td>{r.semester ?? '—'}</td>
                          <td className="text-truncate" style={{ maxWidth: 180 }}>{r.email}</td>
                          <td>{r.errors.length ? <span className="text-danger">{r.errors.join('; ')}</span> : <span className="text-success"><i className="bi bi-check-circle me-1" />OK</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
                <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mt-3">
                  <span className="small text-muted-2">{preview.invalid ? `${preview.invalid} row(s) will be skipped. Fix them and re-upload, or import the rest now.` : 'All rows look good.'}</span>
                  <div className="d-flex gap-2">
                    <Button variant="light" onClick={() => { setPreview(null); setFile(null); }}>Cancel</Button>
                    <Button onClick={doImport} disabled={!preview.valid || busy}><i className="bi bi-person-plus me-1" />{busy ? 'Importing…' : `Import ${preview.valid} student${preview.valid === 1 ? '' : 's'}`}</Button>
                  </div>
                </div>
              </>
            )}
          </Panel>
        </Col>
      </Row>
    </>
  );
}
