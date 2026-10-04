import { useState } from 'react';
import { Alert, Button, Col, Dropdown, Form, Modal, Nav, Row, Table } from 'react-bootstrap';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api/client';
import { useApi } from '../../api/useApi';
import { ROLES, SECTIONS, SEMESTERS } from '../../data/constants';
import { useCurrentUser } from '../../auth/AuthContext';
import { fmtDateTime, fromNow } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { Avatar, EmptyState, ErrorState, Loading, PageHeader, Pager, Panel, RoleBadge, StatusBadge, Tag } from '../../components/ui';
import { attempt, confirmDialog } from '../../components/feedback';

const STAFF_ROLES = ['ORGANIZER', 'SECURITY', 'ADMIN'];
const TAB_LABELS = { '': 'All', STUDENT: 'Students', ORGANIZER: 'Organizers', SECURITY: 'Security staff', ADMIN: 'Administrators' };

function TempPasswordNote({ name, password }) {
  return (
    <>
      <p className="mb-2">Give this temporary password to {name}. They must change it at first sign-in. It won't be shown again.</p>
      <div className="mono fs-4 text-center p-2 border rounded bg-light user-select-all">{password}</div>
    </>
  );
}

function UserModal({ user, departments, onHide, onSaved }) {
  const isNew = !user.id;
  const [f, setF] = useState(() => ({
    role: user.role || 'STUDENT', name: user.name || '', email: user.email || '', phone: user.phone || '', unit: user.unit || '',
    urn: user.student?.urn || '', dept: user.student?.dept || departments[0]?.code, semester: user.student?.semester || 1,
    section: user.student?.section || 'A', batch: user.student?.batch || '', dob: user.student?.dob || '',
  }));
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const student = f.role === 'STUDENT'
      ? { urn: f.urn.trim(), dept: f.dept, semester: Number(f.semester), section: f.section, batch: f.batch ? Number(f.batch) : null, dob: f.dob || null }
      : null;
    const body = { role: f.role, name: f.name.trim(), email: f.email.trim(), phone: f.phone || null, unit: f.role === 'STUDENT' ? null : f.unit || null, student };
    try {
      if (isNew) {
        const r = await api('/admin/users', { method: 'POST', body });
        onHide();
        onSaved();
        await confirmDialog({ title: 'Account created', details: <TempPasswordNote name={r.user.name} password={r.tempPassword} />, confirmText: 'Done', cancelText: 'Close' });
      } else {
        await api(`/admin/users/${user.id}`, { method: 'PATCH', body });
        onHide();
        onSaved();
      }
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.errors || {});
    }
  };
  const fe = (k) => fieldErrors[k] || fieldErrors[`student.${k}`];

  return (
    <Modal show onHide={onHide} centered size="lg">
      <Form onSubmit={submit} noValidate>
        <Modal.Header closeButton><Modal.Title>{isNew ? 'Add user' : `Edit ${user.name}`}</Modal.Title></Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}
          <Row className="g-3">
            <Col md={4}><Form.Group controlId="u-role"><Form.Label>Role</Form.Label>
              <Form.Select value={f.role} onChange={set('role')} disabled={!isNew}>{['STUDENT', ...STAFF_ROLES].map((k) => <option key={k} value={k}>{ROLES[k].label}</option>)}</Form.Select></Form.Group></Col>
            <Col md={8}><Form.Group controlId="u-name"><Form.Label>Full name</Form.Label><Form.Control value={f.name} onChange={set('name')} isInvalid={!!fe('name')} required /><Form.Control.Feedback type="invalid">{fe('name')}</Form.Control.Feedback></Form.Group></Col>
            <Col md={6}><Form.Group controlId="u-email"><Form.Label>Email</Form.Label><Form.Control type="email" value={f.email} onChange={set('email')} isInvalid={!!fe('email')} required /><Form.Control.Feedback type="invalid">{fe('email')}</Form.Control.Feedback></Form.Group></Col>
            <Col md={6}><Form.Group controlId="u-phone"><Form.Label>Phone</Form.Label><Form.Control value={f.phone} onChange={set('phone')} /></Form.Group></Col>
            {f.role === 'STUDENT' ? (
              <>
                <Col md={4}><Form.Group controlId="u-urn"><Form.Label>URN</Form.Label><Form.Control value={f.urn} onChange={set('urn')} disabled={!isNew} className="mono" inputMode="numeric" isInvalid={!!fe('urn')} /><Form.Control.Feedback type="invalid">{fe('urn')}</Form.Control.Feedback></Form.Group></Col>
                <Col md={4}><Form.Group controlId="u-dept"><Form.Label>Department</Form.Label><Form.Select value={f.dept} onChange={set('dept')}>{departments.map((d) => <option key={d.code} value={d.code}>{d.code} — {d.name}</option>)}</Form.Select></Form.Group></Col>
                <Col md={2}><Form.Group controlId="u-sem"><Form.Label>Semester</Form.Label><Form.Select value={f.semester} onChange={set('semester')}>{SEMESTERS.map((n) => <option key={n}>{n}</option>)}</Form.Select></Form.Group></Col>
                <Col md={2}><Form.Group controlId="u-sec"><Form.Label>Section</Form.Label><Form.Select value={f.section} onChange={set('section')}>{SECTIONS.map((n) => <option key={n}>{n}</option>)}</Form.Select></Form.Group></Col>
                <Col md={4}><Form.Group controlId="u-batch"><Form.Label>Batch (year joined)</Form.Label><Form.Control type="number" value={f.batch} onChange={set('batch')} /></Form.Group></Col>
                <Col md={4}><Form.Group controlId="u-dob"><Form.Label>Date of birth</Form.Label><Form.Control type="date" value={f.dob} onChange={set('dob')} /></Form.Group></Col>
              </>
            ) : (
              <Col md={12}><Form.Group controlId="u-unit"><Form.Label>Department / unit</Form.Label><Form.Control value={f.unit} onChange={set('unit')} placeholder="e.g. CSE Department, Campus Security" /></Form.Group></Col>
            )}
          </Row>
          {isNew && <p className="small text-muted-2 mt-3 mb-0"><i className="bi bi-key me-1" />A temporary password is generated; the user sets their own at first sign-in.</p>}
        </Modal.Body>
        <Modal.Footer><Button variant="light" onClick={onHide}>Cancel</Button><Button type="submit">{isNew ? 'Create account' : 'Save changes'}</Button></Modal.Footer>
      </Form>
    </Modal>
  );
}

export default function Users() {
  useTitle('Users & roles');
  const me = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const role = params.get('role') || '';
  const status = params.get('status') || '';
  const dept = params.get('dept') || '';
  const semester = params.get('semester') || '';
  const page = Number(params.get('page') || 1);
  const [q, setQ] = useState(params.get('q') || '');
  const search = params.get('q') || '';
  const [editing, setEditing] = useState(null);
  const departments = useApi('/departments');
  const counts = useApi('/admin/users/counts');
  const res = useApi(`/admin/users${qs({ role, status, q: search, dept, semester, page, size: 15 })}`);
  const set = (patch) => setParams(Object.fromEntries(Object.entries({ role, status, q: search, dept, semester, page: '', ...patch }).filter(([, v]) => v)));
  const refresh = () => { res.reload(); counts.reload(); };

  const resetPw = async (u) => {
    if (!(await confirmDialog({ title: `Reset ${u.name}'s password?`, message: 'A new temporary password is generated, any lock is cleared, and they are signed out everywhere.', confirmText: 'Reset password' }))) return;
    const r = await attempt(() => api(`/admin/users/${u.id}/reset-password`, { method: 'POST' }));
    if (r) {
      refresh();
      await confirmDialog({ title: 'Temporary password', details: <TempPasswordNote name={u.name} password={r.tempPassword} />, confirmText: 'Done', cancelText: 'Close' });
    }
  };
  const setStatus = async (u, s) => {
    if (s === 'INACTIVE' && !(await confirmDialog({ title: `Deactivate ${u.name}?`, message: 'They can no longer sign in, and their passes are refused at the gate.', confirmText: 'Deactivate', variant: 'danger' }))) return;
    if (await attempt(() => api(`/admin/users/${u.id}/status`, { method: 'PATCH', body: { status: s } }), s === 'ACTIVE' ? `${u.name} is active.` : `${u.name} is deactivated.`)) refresh();
  };
  const setEnrollment = async (u, enrolled) => {
    if (await attempt(() => api(`/admin/users/${u.id}/enrollment`, { method: 'PATCH', body: { enrolled } }), enrolled ? 'Enrollment restored.' : 'Marked not enrolled — their passes are refused at the gate.')) refresh();
  };

  const roleTabs = ['', 'STUDENT', ...STAFF_ROLES];
  return (
    <>
      <PageHeader title="Users & roles" subtitle="Students usually arrive through bulk import. Staff accounts are created here." actions={<Button onClick={() => setEditing({})} disabled={!departments.data}><i className="bi bi-person-plus me-1" />Add user</Button>} />
      <Nav variant="tabs" activeKey={role} onSelect={(k) => set({ role: k })}>
        {roleTabs.map((r) => (
          <Nav.Item key={r || 'all'}><Nav.Link eventKey={r}>{TAB_LABELS[r]}<span className="opacity-75">({counts.data ? counts.data[r || 'ALL'] : '…'})</span></Nav.Link></Nav.Item>
        ))}
      </Nav>
      <Panel flush className="border-top-0">
        <Form className="filter-bar p-3 border-bottom" onSubmit={(e) => { e.preventDefault(); set({ q }); }}>
          <div className="search-box"><i className="bi bi-search" aria-hidden="true" /><Form.Control type="search" size="sm" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q !== search && set({ q })} placeholder="Search name, email or URN" aria-label="Search users" /></div>
          <Form.Select size="sm" value={status} onChange={(e) => set({ status: e.target.value })} aria-label="Status"><option value="">Any status</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="LOCKED">Locked</option></Form.Select>
          {(role === 'STUDENT' || role === '') && (
            <>
              <Form.Select size="sm" value={dept} onChange={(e) => set({ dept: e.target.value })} aria-label="Department"><option value="">All departments</option>{(departments.data || []).map((d) => <option key={d.code} value={d.code}>{d.code}</option>)}</Form.Select>
              <Form.Select size="sm" value={semester} onChange={(e) => set({ semester: e.target.value })} aria-label="Semester"><option value="">All semesters</option>{SEMESTERS.map((n) => <option key={n} value={n}>Sem {n}</option>)}</Form.Select>
            </>
          )}
          {res.data && <span className="small text-muted-2 ms-auto">{res.data.total} users</span>}
        </Form>
        {res.error && !res.data ? <ErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <Loading /> : !res.data.items.length ? <EmptyState icon="people" title="No users match" /> : (
          <Table hover responsive className="mb-0 align-middle table-stack">
            <thead><tr><th>User</th><th>Role</th><th>Details</th><th>Status</th><th>Last sign-in</th><th className="text-end">Actions</th></tr></thead>
            <tbody>
              {res.data.items.map((u) => (
                <tr key={u.id}>
                  <td className="td-main">
                    <div className="d-flex gap-2 align-items-center">
                      <Avatar user={u} size={34} />
                      <div className="min-w-0"><div className="fw-600">{u.name}{u.id === me.id && <span className="text-muted-2 small"> (you)</span>}</div><div className="small-2 text-muted-2 mono text-truncate">{u.student?.urn || u.email}</div></div>
                    </div>
                  </td>
                  <td data-label="Role"><RoleBadge role={u.role} /></td>
                  <td data-label="Details" className="small">
                    {u.student ? <>{u.student.dept} · Sem {u.student.semester} · {u.student.section} {!u.student.enrolled && <Tag tone="danger">Not enrolled</Tag>}</> : u.unit || '—'}
                    {u.mustChangePassword && <div><Tag tone="warning" icon="key">Temporary password</Tag></div>}
                  </td>
                  <td data-label="Status"><StatusBadge kind="user" status={u.status} />{u.status === 'LOCKED' && u.lockedUntil && <div className="small-2 text-muted-2">until {fmtDateTime(u.lockedUntil)}</div>}</td>
                  <td data-label="Last sign-in" className="small">{u.lastLoginAt ? fromNow(u.lastLoginAt) : 'Never'}</td>
                  <td data-label="Actions" className="text-end">
                    <Dropdown align="end">
                      <Dropdown.Toggle size="sm" variant="light" aria-label={`Actions for ${u.name}`}>Manage</Dropdown.Toggle>
                      <Dropdown.Menu>
                        <Dropdown.Item onClick={() => setEditing(u)}><i className="bi bi-pencil-square me-2" />Edit details</Dropdown.Item>
                        <Dropdown.Item onClick={() => resetPw(u)}><i className="bi bi-key me-2" />Reset password</Dropdown.Item>
                        {u.student && <Dropdown.Item onClick={() => setEnrollment(u, !u.student.enrolled)}><i className="bi bi-mortarboard me-2" />{u.student.enrolled ? 'Mark not enrolled' : 'Restore enrollment'}</Dropdown.Item>}
                        {u.status === 'LOCKED' && <Dropdown.Item onClick={() => setStatus(u, 'ACTIVE')}><i className="bi bi-unlock me-2" />Unlock account</Dropdown.Item>}
                        {u.id !== me.id && u.status === 'ACTIVE' && <Dropdown.Item className="text-danger" onClick={() => setStatus(u, 'INACTIVE')}><i className="bi bi-pause-circle me-2" />Deactivate</Dropdown.Item>}
                        {u.status === 'INACTIVE' && <Dropdown.Item onClick={() => setStatus(u, 'ACTIVE')}><i className="bi bi-play-circle me-2" />Activate</Dropdown.Item>}
                      </Dropdown.Menu>
                    </Dropdown>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {res.data && <div className="p-2"><Pager page={res.data.page} pages={res.data.pages} onChange={(p) => set({ page: p > 1 ? String(p) : '' })} /></div>}
      </Panel>
      {editing && departments.data && <UserModal user={editing} departments={departments.data} onHide={() => setEditing(null)} onSaved={refresh} />}
    </>
  );
}
