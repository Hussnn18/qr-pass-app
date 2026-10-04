import { useMemo, useState } from 'react';
import { Alert, Button, Col, Dropdown, Form, Modal, Nav, Row, Table } from 'react-bootstrap';
import { useSearchParams } from 'react-router-dom';
import { ROLES, SECTIONS, SEMESTERS } from '../../data/constants';
import { useStore } from '../../store/store';
import { useCurrentUser } from '../../store/session';
import { addUser, resetUserPassword, setUserStatus, toggleEnrollment, updateUser } from '../../store/actions';
import { fmtDateTime, fromNow } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { Avatar, EmptyState, PageHeader, Pager, Panel, RoleBadge, StatusBadge, Tag, paginate } from '../../components/ui';
import { confirmDialog, toast } from '../../components/feedback';

function UserModal({ user, onHide }) {
  const s = useStore();
  const isNew = !user.id;
  const [f, setF] = useState(() => ({ role: 'STUDENT', name: '', email: '', phone: '', urn: '', dept: s.departments[0]?.id, semester: 1, section: 'A', organization: '', unit: '', ...user }));
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return setError('Name and a valid email are required.');
    if (f.role === 'STUDENT' && !/^\d{7}$/.test(f.urn || '')) return setError('URN must be 7 digits.');
    const data = { role: f.role, name: f.name.trim(), email: f.email.trim().toLowerCase(), phone: f.phone };
    if (f.role === 'STUDENT') Object.assign(data, { urn: f.urn, dept: f.dept, semester: Number(f.semester), section: f.section, batch: f.batch || new Date().getFullYear() - Math.ceil(f.semester / 2) + 1 });
    if (f.role === 'GUEST') data.organization = f.organization;
    if (['ORGANIZER', 'SECURITY', 'ADMIN'].includes(f.role)) data.unit = f.unit;
    if (isNew) {
      const r = addUser(data);
      if (!r.ok) return setError(r.message);
      onHide();
      await confirmDialog({ title: 'Account created', message: `Share this temporary password with ${data.name}. They must change it on first sign-in.`, details: <div className="mono fs-4 text-center p-2 border rounded bg-light">{r.tempPassword}</div>, confirmText: 'Done', cancelText: 'Close' });
    } else {
      toast.result(updateUser(user.id, data));
      onHide();
    }
  };
  return (
    <Modal show onHide={onHide} centered size="lg">
      <Form onSubmit={submit}>
        <Modal.Header closeButton><Modal.Title>{isNew ? 'Add user' : `Edit ${user.name}`}</Modal.Title></Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}
          <Row className="g-3">
            <Col md={4}><Form.Group controlId="u-role"><Form.Label>Role</Form.Label>
              <Form.Select value={f.role} onChange={set('role')} disabled={!isNew}>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Form.Select></Form.Group></Col>
            <Col md={8}><Form.Group controlId="u-name"><Form.Label>Full name</Form.Label><Form.Control value={f.name} onChange={set('name')} required /></Form.Group></Col>
            <Col md={6}><Form.Group controlId="u-email"><Form.Label>Email</Form.Label><Form.Control type="email" value={f.email} onChange={set('email')} required /></Form.Group></Col>
            <Col md={6}><Form.Group controlId="u-phone"><Form.Label>Phone</Form.Label><Form.Control value={f.phone} onChange={set('phone')} /></Form.Group></Col>
            {f.role === 'STUDENT' && (
              <>
                <Col md={3}><Form.Group controlId="u-urn"><Form.Label>URN</Form.Label><Form.Control value={f.urn} onChange={set('urn')} disabled={!isNew} className="mono" inputMode="numeric" /></Form.Group></Col>
                <Col md={3}><Form.Group controlId="u-dept"><Form.Label>Department</Form.Label><Form.Select value={f.dept} onChange={set('dept')}>{s.departments.map((d) => <option key={d.id} value={d.id}>{d.id}</option>)}</Form.Select></Form.Group></Col>
                <Col md={3}><Form.Group controlId="u-sem"><Form.Label>Semester</Form.Label><Form.Select value={f.semester} onChange={(e) => setF((x) => ({ ...x, semester: Number(e.target.value) }))}>{SEMESTERS.map((n) => <option key={n}>{n}</option>)}</Form.Select></Form.Group></Col>
                <Col md={3}><Form.Group controlId="u-sec"><Form.Label>Section</Form.Label><Form.Select value={f.section} onChange={set('section')}>{SECTIONS.map((n) => <option key={n}>{n}</option>)}</Form.Select></Form.Group></Col>
              </>
            )}
            {f.role === 'GUEST' && <Col md={12}><Form.Group controlId="u-org"><Form.Label>Organization</Form.Label><Form.Control value={f.organization} onChange={set('organization')} /></Form.Group></Col>}
            {['ORGANIZER', 'SECURITY', 'ADMIN'].includes(f.role) && <Col md={12}><Form.Group controlId="u-unit"><Form.Label>Department / unit</Form.Label><Form.Control value={f.unit} onChange={set('unit')} placeholder="e.g. CSE Department, Campus Security" /></Form.Group></Col>}
          </Row>
          {isNew && <p className="small text-muted-2 mt-3 mb-0"><i className="bi bi-key me-1" />A temporary password is generated. The user must change it on first sign-in.</p>}
        </Modal.Body>
        <Modal.Footer><Button variant="light" onClick={onHide}>Cancel</Button><Button type="submit">{isNew ? 'Create account' : 'Save changes'}</Button></Modal.Footer>
      </Form>
    </Modal>
  );
}

export default function Users() {
  useTitle('Users & roles');
  const s = useStore();
  const me = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const role = params.get('role') || 'ALL';
  const status = params.get('status') || '';
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [sem, setSem] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);

  const list = useMemo(() => s.users
    .filter((u) => role === 'ALL' || u.role === role)
    .filter((u) => !status || u.status === status)
    .filter((u) => !q || `${u.name} ${u.email} ${u.urn || ''}`.toLowerCase().includes(q.toLowerCase()))
    .filter((u) => !dept || u.dept === dept)
    .filter((u) => !sem || u.semester === Number(sem))
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name)), [s.users, role, status, q, dept, sem]);
  const { rows, pages, page: p } = paginate(list, page, 15);
  const setFilter = (patch) => { setParams({ ...Object.fromEntries(params), ...patch }); setPage(1); };

  const tempPw = async (u) => {
    if (!(await confirmDialog({ title: `Reset ${u.name}'s password?`, message: 'A new temporary password is generated and any lock is cleared.', confirmText: 'Reset password' }))) return;
    const r = resetUserPassword(u.id);
    await confirmDialog({ title: 'Temporary password', message: `Share this with ${u.name}. It must be changed at next sign-in.`, details: <div className="mono fs-4 text-center p-2 border rounded bg-light">{r.tempPassword}</div>, confirmText: 'Done', cancelText: 'Close' });
  };
  const toggleStatus = async (u) => {
    const deactivate = u.status === 'ACTIVE';
    if (deactivate && !(await confirmDialog({ title: `Deactivate ${u.name}?`, message: 'They can no longer sign in, and their passes are rejected at the gate.', confirmText: 'Deactivate', variant: 'danger' }))) return;
    toast.result(setUserStatus(u.id, deactivate ? 'INACTIVE' : 'ACTIVE'));
  };

  const counts = Object.fromEntries(['ALL', ...Object.keys(ROLES)].map((r) => [r, r === 'ALL' ? s.users.length : s.users.filter((u) => u.role === r).length]));

  return (
    <>
      <PageHeader title="Users & roles" subtitle="Manage every account. Students are usually added through bulk import." actions={<Button onClick={() => setEditing({})}><i className="bi bi-person-plus me-1" />Add user</Button>} />
      <Nav variant="tabs" activeKey={role} onSelect={(k) => setFilter({ role: k })}>
        {['ALL', 'STUDENT', 'GUEST', 'ORGANIZER', 'SECURITY', 'ADMIN'].map((r) => (
          <Nav.Item key={r}><Nav.Link eventKey={r}>{r === 'ALL' ? 'All' : `${ROLES[r].label}s`} <span className="opacity-75">({counts[r]})</span></Nav.Link></Nav.Item>
        ))}
      </Nav>
      <Panel flush className="border-top-0">
        <div className="filter-bar p-3 border-bottom">
          <div className="search-box"><i className="bi bi-search" aria-hidden="true" /><Form.Control type="search" size="sm" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name, email or URN" aria-label="Search users" /></div>
          <Form.Select size="sm" value={status} onChange={(e) => setFilter({ status: e.target.value })} aria-label="Status"><option value="">Any status</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="LOCKED">Locked</option><option value="PENDING_VERIFICATION">Unverified</option></Form.Select>
          {(role === 'STUDENT' || role === 'ALL') && (
            <>
              <Form.Select size="sm" value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }} aria-label="Department"><option value="">All departments</option>{s.departments.map((d) => <option key={d.id} value={d.id}>{d.id}</option>)}</Form.Select>
              <Form.Select size="sm" value={sem} onChange={(e) => { setSem(e.target.value); setPage(1); }} aria-label="Semester"><option value="">All semesters</option>{SEMESTERS.map((n) => <option key={n} value={n}>Sem {n}</option>)}</Form.Select>
            </>
          )}
          <span className="small text-muted-2 ms-auto">{list.length} users</span>
        </div>
        {!rows.length ? <EmptyState icon="people" title="No users match" /> : (
          <Table hover responsive className="mb-0 align-middle table-stack">
            <thead><tr><th>User</th><th>Role</th><th>Details</th><th>Status</th><th>Last sign-in</th><th className="text-end">Actions</th></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td className="td-main">
                    <div className="d-flex gap-2 align-items-center">
                      <Avatar user={u} size={34} />
                      <div className="min-w-0"><div className="fw-600">{u.name}{u.id === me.id && <span className="text-muted-2 small"> (you)</span>}</div><div className="small-2 text-muted-2 mono text-truncate">{u.urn || u.email}</div></div>
                    </div>
                  </td>
                  <td data-label="Role"><RoleBadge role={u.role} /></td>
                  <td data-label="Details" className="small">
                    {u.role === 'STUDENT' ? <>{u.dept} · Sem {u.semester} · {u.section} {!u.enrolled && <Tag tone="danger">Not enrolled</Tag>}</> : u.organization || u.unit || '—'}
                    {u.mustChangePassword && <div><Tag tone="warning" icon="key">Temp password</Tag></div>}
                  </td>
                  <td data-label="Status"><StatusBadge kind="user" status={u.status} />{u.status === 'LOCKED' && u.lockedUntil && <div className="small-2 text-muted-2">until {fmtDateTime(u.lockedUntil)}</div>}</td>
                  <td data-label="Last sign-in" className="small">{u.lastLoginAt ? fromNow(u.lastLoginAt) : 'Never'}</td>
                  <td data-label="Actions" className="text-end">
                    <Dropdown align="end">
                      <Dropdown.Toggle size="sm" variant="light" aria-label={`Actions for ${u.name}`}>Manage</Dropdown.Toggle>
                      <Dropdown.Menu>
                        <Dropdown.Item onClick={() => setEditing(u)}><i className="bi bi-pencil-square me-2" />Edit details</Dropdown.Item>
                        <Dropdown.Item onClick={() => tempPw(u)}><i className="bi bi-key me-2" />Reset password</Dropdown.Item>
                        {u.role === 'STUDENT' && <Dropdown.Item onClick={() => toast.result(toggleEnrollment(u.id))}><i className="bi bi-mortarboard me-2" />{u.enrolled ? 'Mark not enrolled' : 'Restore enrollment'}</Dropdown.Item>}
                        {u.status === 'LOCKED' && <Dropdown.Item onClick={() => toast.result(setUserStatus(u.id, 'ACTIVE'))}><i className="bi bi-unlock me-2" />Unlock account</Dropdown.Item>}
                        {u.id !== me.id && u.status !== 'LOCKED' && (
                          <Dropdown.Item className={u.status === 'ACTIVE' ? 'text-danger' : ''} onClick={() => toggleStatus(u)}>
                            <i className={`bi bi-${u.status === 'ACTIVE' ? 'pause-circle' : 'play-circle'} me-2`} />{u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          </Dropdown.Item>
                        )}
                      </Dropdown.Menu>
                    </Dropdown>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <div className="p-2"><Pager page={p} pages={pages} onChange={setPage} /></div>
      </Panel>
      {editing && <UserModal user={editing} onHide={() => setEditing(null)} />}
    </>
  );
}
