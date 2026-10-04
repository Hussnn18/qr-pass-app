import { useMemo, useState } from 'react';
import { Alert, Button, Dropdown, Form, Nav, Table } from 'react-bootstrap';
import { REG_STATUS } from '../../data/constants';
import { useStore } from '../../store/store';
import { byId, passForRegistration, waitlistPosition } from '../../store/selectors';
import { approveRegistrations, bulkAssign, logExport, reissuePass, rejectRegistrations, removeRegistration, revokePass } from '../../store/actions';
import { fmtDateTime } from '../../utils/format';
import { downloadText, toCSV } from '../../utils/files';
import { Avatar, EmptyState, Pager, Panel, StatusBadge, Tag, paginate } from '../../components/ui';
import { confirmDialog, toast } from '../../components/feedback';

const ORDER = ['PENDING', 'WAITLISTED', 'APPROVED', 'REJECTED', 'CANCELLED'];

export default function RegistrationsTab({ ev }) {
  const s = useStore();
  const regs = s.registrations.filter((r) => r.eventId === ev.id);
  const counts = Object.fromEntries(ORDER.map((k) => [k, regs.filter((r) => r.status === k).length]));
  const [status, setStatus] = useState(counts.PENDING ? 'PENDING' : 'ALL');
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [type, setType] = useState('');
  const [sel, setSel] = useState(() => new Set());
  const [page, setPage] = useState(1);

  const list = useMemo(() => s.registrations
    .filter((r) => r.eventId === ev.id)
    .map((r) => ({ r, u: byId(s.users, r.userId), att: s.attendance.find((a) => a.registrationId === r.id) }))
    // "Checked in" is derived from attendance, every other tab from the registration status.
    .filter(({ r, att }) => status === 'ALL' || (status === 'CHECKED_IN' ? !!att : r.status === status))
    .filter(({ u }) => !q || `${u?.name} ${u?.urn || ''} ${u?.email}`.toLowerCase().includes(q.toLowerCase()))
    .filter(({ u }) => !dept || u?.dept === dept)
    .filter(({ u }) => !type || u?.role === type)
    .sort((a, b) => ORDER.indexOf(a.r.status) - ORDER.indexOf(b.r.status) || a.r.registeredAt - b.r.registeredAt),
  [s, ev.id, status, q, dept, type]);
  const { rows: pageRows, pages, page: p } = paginate(list, page, 15);
  const selectable = pageRows.filter(({ r }) => ['PENDING', 'WAITLISTED'].includes(r.status));
  const allSelected = selectable.length > 0 && selectable.every(({ r }) => sel.has(r.id));
  const toggle = (id) => setSel((x) => { const n = new Set(x); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel((x) => { const n = new Set(x); selectable.forEach(({ r }) => (allSelected ? n.delete(r.id) : n.add(r.id))); return n; });
  const after = (r) => { toast.result(r); setSel(new Set()); };

  const reject = async (ids) => {
    const reason = await confirmDialog({
      title: `Reject ${ids.length} request${ids.length > 1 ? 's' : ''}?`, message: 'Participants see your reason in their notifications.',
      input: { label: 'Reason', placeholder: 'e.g. Team size above the limit', required: true }, confirmText: 'Reject', variant: 'danger',
    });
    if (reason) after(rejectRegistrations(ids, reason));
  };
  const remove = async (r, u) => {
    const reason = await confirmDialog({
      title: `Remove ${u.name}?`, message: 'Their pass stops working immediately. In open-registration events the next waitlisted person is promoted.',
      input: { label: 'Reason (sent to the participant)', initial: 'Removed by organizer', required: true }, confirmText: 'Remove', variant: 'danger',
    });
    if (reason) toast.result(removeRegistration(r.id, reason));
  };
  const revoke = async (pass, u) => {
    const reason = await confirmDialog({ title: `Revoke ${u.name}'s pass?`, message: 'The QR code stops working. You can issue a new one afterwards.', input: { label: 'Reason', initial: 'Pass reported shared', required: true }, confirmText: 'Revoke', variant: 'danger' });
    if (reason) toast.result(revokePass(pass.id, reason));
  };
  const assign = async () => {
    const input = await confirmDialog({
      title: 'Issue passes in bulk',
      message: 'Leave the box empty to issue a pass to every eligible enrolled student, or paste URNs (one per line or comma-separated).',
      input: { label: 'URNs (optional)', placeholder: '2302511, 2302514 …', required: false },
      confirmText: 'Issue passes',
    });
    if (input === false) return;
    const urns = String(input || '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
    const r = bulkAssign(ev.id, urns.length ? urns : null);
    toast.success(`${r.assigned} issued · ${r.skippedExisting} already had one · ${r.skippedIneligible} not eligible${r.skippedFull ? ` · ${r.skippedFull} over capacity` : ''}${r.unknown ? ` · ${r.unknown} unknown URN` : ''}`, 'Bulk issue complete');
  };
  const exportCSV = () => {
    const csv = toCSV(list, [
      { label: 'Name', value: (x) => x.u?.name },
      { label: 'URN', value: (x) => x.u?.urn || '' },
      { label: 'Email', value: (x) => x.u?.email },
      { label: 'Type', value: (x) => x.u?.role },
      { label: 'Department', value: (x) => x.u?.dept || x.u?.organization || '' },
      { label: 'Semester', value: (x) => x.u?.semester || '' },
      { label: 'Status', value: (x) => x.r.status },
      { label: 'Registered at', value: (x) => fmtDateTime(x.r.registeredAt) },
      { label: 'Checked in at', value: (x) => (x.att ? fmtDateTime(x.att.at) : '') },
    ]);
    downloadText(`${ev.title} - registrations.csv`, csv);
    logExport(`Registrations CSV · ${ev.title} · ${list.length} rows`);
  };

  const depts = [...new Set(regs.map((r) => byId(s.users, r.userId)?.dept).filter(Boolean))].sort();
  const tabs = [['ALL', 'All', regs.length], ...ORDER.map((k) => [k, REG_STATUS[k].label, counts[k]]), ['CHECKED_IN', 'Checked in', s.attendance.filter((a) => a.eventId === ev.id).length]];

  return (
    <>
      {ev.mode === 'AUTO_ASSIGN' && (
        <Alert variant="info" className="d-flex flex-wrap gap-2 align-items-center justify-content-between">
          <span className="small"><i className="bi bi-magic me-2" />This event is auto-assigned. Issue passes to eligible students in one step.</span>
          <Button size="sm" onClick={assign} disabled={['CANCELLED', 'COMPLETED'].includes(ev.status)}>Issue passes</Button>
        </Alert>
      )}
      <Nav variant="pills" activeKey={status} onSelect={(k) => { setStatus(k); setPage(1); setSel(new Set()); }} className="gap-1 mb-3 flex-wrap">
        {tabs.map(([k, label, n]) => <Nav.Item key={k}><Nav.Link eventKey={k} className="py-1 px-2 small">{label} <span className="opacity-75">({n})</span></Nav.Link></Nav.Item>)}
      </Nav>
      <Panel flush>
        <div className="filter-bar p-3 border-bottom">
          <div className="search-box">
            <i className="bi bi-search" aria-hidden="true" />
            <Form.Control type="search" size="sm" placeholder="Search name, URN or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search participants" />
          </div>
          <Form.Select size="sm" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department"><option value="">All departments</option>{depts.map((d) => <option key={d}>{d}</option>)}</Form.Select>
          <Form.Select size="sm" value={type} onChange={(e) => setType(e.target.value)} aria-label="Participant type"><option value="">Students & guests</option><option value="STUDENT">Students</option><option value="GUEST">Guests</option></Form.Select>
          <div className="ms-auto d-flex gap-2">
            {ev.mode !== 'AUTO_ASSIGN' && <Button size="sm" variant="light" onClick={assign} disabled={['CANCELLED', 'COMPLETED'].includes(ev.status)}><i className="bi bi-people me-1" />Bulk issue</Button>}
            <Button size="sm" variant="light" onClick={exportCSV} disabled={!list.length}><i className="bi bi-filetype-csv me-1" />Export CSV</Button>
          </div>
        </div>
        {sel.size > 0 && (
          <div className="d-flex flex-wrap gap-2 align-items-center px-3 py-2 border-bottom" style={{ background: 'var(--gn-navy-50)' }} role="region" aria-label="Bulk actions">
            <strong className="small">{sel.size} selected</strong>
            <Button size="sm" variant="success" onClick={() => after(approveRegistrations([...sel]))}><i className="bi bi-check2 me-1" />Approve</Button>
            <Button size="sm" variant="outline-danger" onClick={() => reject([...sel])}><i className="bi bi-x me-1" />Reject</Button>
            <Button size="sm" variant="link" onClick={() => setSel(new Set())}>Clear</Button>
          </div>
        )}
        {!pageRows.length ? (
          <EmptyState icon="people" title="No participants here">{q || dept || type ? 'Try clearing the filters.' : 'Registrations will appear as people sign up.'}</EmptyState>
        ) : (
          <Table hover responsive className="mb-0 align-middle table-stack">
            <thead>
              <tr>
                <th style={{ width: 36 }}>{selectable.length > 0 && <Form.Check aria-label="Select all on this page" checked={allSelected} onChange={toggleAll} />}</th>
                <th>Participant</th><th>Dept / Org</th><th>Registered</th><th>Status</th><th>Pass</th><th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(({ r, u, att }) => {
                const pass = passForRegistration(s, r.id);
                const canPick = ['PENDING', 'WAITLISTED'].includes(r.status);
                return (
                  <tr key={r.id}>
                    <td className="td-check">{canPick && <Form.Check aria-label={`Select ${u?.name}`} checked={sel.has(r.id)} onChange={() => toggle(r.id)} />}</td>
                    <td className="td-main">
                      <div className="d-flex gap-2 align-items-center">
                        <Avatar user={u} size={32} />
                        <div className="min-w-0">
                          <div className="fw-600">{u?.name} {u?.role === 'GUEST' && <Tag tone="info">Guest</Tag>} {u?.role === 'STUDENT' && !u.enrolled && <Tag tone="danger">Not enrolled</Tag>}</div>
                          <div className="small-2 text-muted-2 mono">{u?.urn || u?.email}</div>
                          {r.note && <div className="small-2 fst-italic text-muted-2">“{r.note}”</div>}
                        </div>
                      </div>
                    </td>
                    <td data-label="Dept / Org" className="small">{u?.role === 'STUDENT' ? `${u.dept} · Sem ${u.semester}` : u?.organization}</td>
                    <td data-label="Registered" className="small">{fmtDateTime(r.registeredAt)}</td>
                    <td data-label="Status">
                      <StatusBadge kind="reg" status={r.status} label={r.status === 'WAITLISTED' ? `Waitlist #${waitlistPosition(s, r)}` : undefined} />
                      {r.reason && ['REJECTED', 'CANCELLED'].includes(r.status) && <div className="small-2 text-muted-2">{r.reason}</div>}
                    </td>
                    <td data-label="Pass">{att ? <StatusBadge kind="pass" status="USED" label={`In · ${new Date(att.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`} /> : pass ? <StatusBadge kind="pass" status={pass.status} /> : <span className="text-muted-2 small">—</span>}</td>
                    <td data-label="Actions" className="text-end">
                      <div className="d-flex gap-1 justify-content-end">
                        {r.status === 'PENDING' && <Button size="sm" variant="success" onClick={() => toast.result(approveRegistrations([r.id]))} aria-label={`Approve ${u?.name}`}><i className="bi bi-check2" /></Button>}
                        {r.status === 'PENDING' && <Button size="sm" variant="outline-danger" onClick={() => reject([r.id])} aria-label={`Reject ${u?.name}`}><i className="bi bi-x" /></Button>}
                        {r.status === 'WAITLISTED' && <Button size="sm" variant="outline-primary" onClick={() => toast.result(approveRegistrations([r.id]))}>Promote</Button>}
                        {r.status === 'APPROVED' && !att && (
                          <Dropdown align="end">
                            <Dropdown.Toggle size="sm" variant="light" aria-label={`More actions for ${u?.name}`}><i className="bi bi-three-dots" /></Dropdown.Toggle>
                            <Dropdown.Menu>
                              {pass?.status === 'ACTIVE' && <Dropdown.Item onClick={() => revoke(pass, u)}><i className="bi bi-slash-circle me-2" />Revoke pass</Dropdown.Item>}
                              <Dropdown.Item onClick={() => toast.result(reissuePass(r.id))}><i className="bi bi-arrow-repeat me-2" />Issue new pass</Dropdown.Item>
                              <Dropdown.Divider />
                              <Dropdown.Item className="text-danger" onClick={() => remove(r, u)}><i className="bi bi-person-dash me-2" />Remove participant</Dropdown.Item>
                            </Dropdown.Menu>
                          </Dropdown>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <div className="p-2"><Pager page={p} pages={pages} onChange={setPage} /></div>
      </Panel>
    </>
  );
}
