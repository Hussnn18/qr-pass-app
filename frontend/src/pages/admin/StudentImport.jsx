import { useRef, useState } from 'react';
import { Alert, Button, Col, Form, Row, Table } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useStore } from '../../store/store';
import { importStudents } from '../../store/actions';
import { downloadText, parseCSV } from '../../utils/files';
import { useTitle } from '../../utils/hooks';
import { PageHeader, Panel, StatTile, Tag } from '../../components/ui';
import { toast } from '../../components/feedback';

const HEADERS = ['URN', 'Name', 'Email', 'Phone', 'Department', 'Semester', 'Section', 'Batch', 'DOB'];
const SAMPLE = [
  HEADERS.join(','),
  '2602401,Aarav Sharma,aarav.2602401@gndec.demo,+91 99999 12001,CSE,1,A,2026,2008-04-11',
  '2602402,Baani Kaur,baani.2602402@gndec.demo,+91 99999 12002,CSE,1,B,2026,2008-09-23',
  '2615403,Chirag Bansal,chirag.2615403@gndec.demo,+91 99999 12003,IT,1,A,2026,2007-12-02',
  '2604404,Diya Arora,,+91 99999 12004,ECE,1,C,2026,2008-01-30',
  '2302511,Duplicate Student,dup@gndec.demo,,CSE,7,A,2023,2005-03-14',
  '26054,Short URN,short@gndec.demo,,ME,1,A,2026,2008-06-06',
  '2605406,Ekamjot Singh,ekam.2605406@gndec.demo,,XYZ,1,A,2026,2008-02-17',
  '2606407,Fatehbir Gill,fateh.2606407@gndec.demo,,PE,11,A,2026,2004-',
].join('\n');

function validateRows(raw, s) {
  const [head, ...body] = raw;
  const idx = Object.fromEntries(HEADERS.map((h) => [h, head.findIndex((x) => x.trim().toLowerCase() === h.toLowerCase())]));
  const missing = HEADERS.filter((h) => ['URN', 'Name', 'Department', 'Semester'].includes(h) && idx[h] < 0);
  if (missing.length) return { error: `Missing required column(s): ${missing.join(', ')}` };
  const seen = new Set();
  const depts = new Set(s.departments.map((d) => d.id));
  const rows = body.map((cells, i) => {
    const get = (h) => (idx[h] >= 0 ? (cells[idx[h]] || '').trim() : '');
    const r = { line: i + 2, urn: get('URN'), name: get('Name'), email: get('Email'), phone: get('Phone'), dept: get('Department').toUpperCase(), semester: Number(get('Semester')), section: get('Section').toUpperCase() || 'A', batch: Number(get('Batch')) || null, dob: get('DOB') };
    const errors = [];
    if (!/^\d{7}$/.test(r.urn)) errors.push('URN must be 7 digits');
    else if (s.users.some((u) => u.urn === r.urn)) errors.push('URN already exists');
    else if (seen.has(r.urn)) errors.push('Duplicate URN in file');
    seen.add(r.urn);
    if (r.name.length < 3) errors.push('Name missing');
    if (!depts.has(r.dept)) errors.push(`Unknown department "${r.dept}"`);
    if (!(r.semester >= 1 && r.semester <= 8)) errors.push('Semester must be 1–8');
    if (r.dob && !/^\d{4}-\d{2}-\d{2}$/.test(r.dob)) errors.push('DOB must be YYYY-MM-DD');
    if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) errors.push('Invalid email');
    if (!r.email && !errors.length) r.email = `${r.name.split(' ')[0].toLowerCase()}.${r.urn}@gndec.demo`;
    return { ...r, errors, generatedEmail: !get('Email') };
  });
  return { rows };
}

export default function StudentImport() {
  useTitle('Student import');
  const s = useStore();
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [done, setDone] = useState(null);

  const load = (name, text) => {
    setDone(null);
    setFile(name);
    const raw = parseCSV(text);
    if (raw.length < 2) return setParsed({ error: 'The file has no data rows.' });
    setParsed(validateRows(raw, s));
  };
  const onFile = (f) => {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) return toast.error('Please upload a .csv file. (The real system also accepts .xlsx.)');
    const reader = new FileReader();
    reader.onload = () => load(f.name, String(reader.result));
    reader.readAsText(f);
  };
  const valid = parsed?.rows?.filter((r) => !r.errors.length) || [];
  const invalid = parsed?.rows?.filter((r) => r.errors.length) || [];
  const shown = (onlyErrors ? invalid : parsed?.rows || []).slice(0, 200);

  const doImport = () => {
    const r = importStudents(valid.map(({ line, errors, generatedEmail, ...x }) => ({ ...x, batch: x.batch || new Date().getFullYear() })));
    setDone({ added: r.added, skipped: invalid.length });
    setParsed(null);
    setFile(null);
    toast.success(`${r.added} students imported.`);
  };

  return (
    <>
      <PageHeader title="Student import" crumbs={[{ label: 'Users & roles', to: '/admin/users' }]} subtitle="Upload a CSV exported from the college ERP. Rows are checked before anything is saved." />
      <Row className="g-3">
        <Col lg={4} className="section-gap">
          <Panel title="1. Upload file" icon="file-earmark-arrow-up">
            <div
              className={`dropzone ${drag ? 'drag' : ''}`} role="button" tabIndex={0}
              onClick={() => input.current.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files?.[0]); }}
              aria-label="Choose or drop a CSV file"
            >
              <i className="bi bi-cloud-arrow-up" aria-hidden="true" />
              <div className="fw-600 mt-1">Drop a CSV here or click to browse</div>
              <div className="small text-muted-2">{file || 'Up to 5,000 rows'}</div>
            </div>
            <input ref={input} type="file" accept=".csv,text/csv" className="d-none" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
            <div className="d-flex flex-wrap gap-2 mt-3">
              <Button size="sm" variant="light" onClick={() => downloadText('students_sample.csv', SAMPLE)}><i className="bi bi-download me-1" />Sample CSV</Button>
              <Button size="sm" variant="outline-primary" onClick={() => load('students_sample.csv', SAMPLE)}><i className="bi bi-play me-1" />Try the sample</Button>
            </div>
          </Panel>
          <Panel title="Required columns" icon="list-check">
            <div className="d-flex flex-wrap gap-1">{HEADERS.map((h) => <Tag key={h} tone={['URN', 'Name', 'Department', 'Semester'].includes(h) ? 'primary' : 'secondary'}>{h}</Tag>)}</div>
            <p className="small text-muted-2 mt-2 mb-0">Blue columns are required. Missing emails are generated. Every imported student gets a temporary password and must change it at first sign-in.</p>
          </Panel>
        </Col>
        <Col lg={8}>
          {done && (
            <Alert variant="success">
              <Alert.Heading className="h6 fw-bold"><i className="bi bi-check-circle me-2" />Import complete</Alert.Heading>
              <p className="small mb-2">{done.added} students added · {done.skipped} rows skipped. Default password for this demo: <code>demo</code> (they're asked to change it).</p>
              <Button size="sm" as={Link} to="/admin/users?role=STUDENT" variant="success">View students</Button>
            </Alert>
          )}
          <Panel title="2. Review & import" icon="table" actions={parsed?.rows && <Form.Check type="switch" id="only-err" label="Show only problems" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />}>
            {!parsed ? (
              <div className="text-center text-muted-2 py-5 small"><i className="bi bi-table fs-2 d-block mb-2" aria-hidden="true" />Upload a file to preview it here.</div>
            ) : parsed.error ? (
              <Alert variant="danger" className="mb-0">{parsed.error}</Alert>
            ) : (
              <>
                <Row className="g-2 mb-3">
                  <Col xs={4}><StatTile icon="file-text" label="Rows" value={parsed.rows.length} tone="primary" /></Col>
                  <Col xs={4}><StatTile icon="check-circle" label="Ready" value={valid.length} tone="success" /></Col>
                  <Col xs={4}><StatTile icon="exclamation-triangle" label="With problems" value={invalid.length} tone={invalid.length ? 'danger' : 'secondary'} /></Col>
                </Row>
                <div style={{ maxHeight: 420, overflow: 'auto' }}>
                  <Table size="sm" hover className="small align-middle mb-0">
                    <thead className="sticky-top"><tr><th>Line</th><th>URN</th><th>Name</th><th>Dept</th><th>Sem</th><th>Email</th><th>Check</th></tr></thead>
                    <tbody>
                      {shown.map((r) => (
                        <tr key={r.line} className={r.errors.length ? 'row-error' : ''}>
                          <td>{r.line}</td><td className="mono">{r.urn}</td><td>{r.name}</td><td>{r.dept}</td><td>{r.semester || '—'}</td>
                          <td className="text-truncate" style={{ maxWidth: 180 }}>{r.email}{r.generatedEmail && !r.errors.length && <Tag tone="info">generated</Tag>}</td>
                          <td>{r.errors.length ? <span className="text-danger">{r.errors.join('; ')}</span> : <span className="text-success"><i className="bi bi-check-circle me-1" />OK</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
                <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mt-3">
                  <span className="small text-muted-2">{invalid.length ? `${invalid.length} row(s) will be skipped. Fix them in the file and re-upload, or import the rest now.` : 'All rows look good.'}</span>
                  <div className="d-flex gap-2">
                    <Button variant="light" onClick={() => { setParsed(null); setFile(null); }}>Cancel</Button>
                    <Button onClick={doImport} disabled={!valid.length}><i className="bi bi-person-plus me-1" />Import {valid.length} student{valid.length === 1 ? '' : 's'}</Button>
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
