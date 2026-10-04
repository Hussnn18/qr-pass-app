import { useState } from 'react';
import { Alert, Button, Dropdown, Form, Nav, Table } from 'react-bootstrap';
import { api, download, qs } from '../../api/client';
import { useApi } from '../../api/useApi';
import { REG_STATUS } from '../../data/constants';
import { fmtDateTime, fmtTime } from '../../utils/format';
import { Avatar, EmptyState, ErrorState, Loading, Pager, Panel, StatusBadge, Tag } from '../../components/ui';
import { attempt, confirmDialog, toast } from '../../components/feedback';

const ORDER = ['PENDING', 'WAITLISTED', 'CONFIRMED', 'REJECTED', 'CANCELLED'];

/** Participant information (O1-12) and the organizer's registration decisions (O2-10). */
export default function RegistrationsTab({ ev, onChange }) {
  const st = ev.stats;
  const [status, setStatus] = useState(st.pending ? 'PENDING' : 'ALL');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState(() => new Set());
  const filters = { status: status === 'ALL' ? '' : status, q: search, type };
  const res = useApi(`/manage/events/${ev.id}/participants${qs({ ...filters, page, size: 15 })}`);
  const rows = res.data?.items || [];
  const locked = ['CANCELLED', 'COMPLETED'].includes(ev.status);

  const refresh = () => {
    setSel(new Set());
    res.reload();
    onChange?.();
  };
  const selectable = rows.filter((r) => r.status === 'PENDING' || r.status === 'WAITLISTED');
  const allSelected = selectable.length > 0 && selectable.every((r) => sel.has(r.registrationId));
  const toggle = (id) => setSel((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSel((x) => { const n = new Set(x); selectable.forEach((r) => (allSelected ? n.delete(r.registrationId) : n.add(r.registrationId))); return n; });

  const approve = async (ids) => {
    if (await attempt(() => api('/manage/registrations/approve', { method: 'POST', body: { ids } }), (r) => r.message)) refresh();
  };
  const reject = async (ids) => {
    const reason = await confirmDialog({
      title: `Reject ${ids.length} request${ids.length > 1 ? 's' : ''}?`, message: 'Students see your reason on their registrations page.',
      input: { label: 'Reason', placeholder: 'e.g. Team size above the limit', required: true }, confirmText: 'Reject', variant: 'danger',
    });
    if (reason && (await attempt(() => api('/manage/registrations/reject', { method: 'POST', body: { ids, reason } }), (r) => r.message))) refresh();
  };
  const remove = async (r) => {
    const reason = await confirmDialog({
      title: `Remove ${r.person.name}?`, message: 'Their pass stops working immediately. In open-registration events the next waitlisted student is promoted.',
      input: { label: 'Reason (shown to the student)', initial: 'Removed by organizer', required: true }, confirmText: 'Remove', variant: 'danger',
    });
    if (reason && (await attempt(() => api(`/manage/registrations/${r.registrationId}/remove`, { method: 'POST', body: { reason } }), (x) => x.message))) refresh();
  };
  const revoke = async (r) => {
    const reason = await confirmDialog({ title: `Revoke ${r.person.name}'s pass?`, message: 'The QR code stops working. You can issue a new one afterwards.', input: { label: 'Reason', initial: 'Pass reported shared', required: true }, confirmText: 'Revoke', variant: 'danger' });
    if (reason && (await attempt(() => api(`/manage/passes/${r.pass.id}/revoke`, { method: 'POST', body: { reason } }), 'Pass revoked.')) !== undefined) refresh();
  };
  const reissue = async (r) => {
    if ((await attempt(() => api(`/manage/registrations/${r.registrationId}/reissue-pass`, { method: 'POST' }), 'New pass issued. The old QR no longer works.')) !== undefined) refresh();
  };
  const bulkAssign = async () => {
    const input = await confirmDialog({
      title: 'Issue passes in bulk',
      message: 'Leave the box empty to issue a pass to every eligible enrolled student, or paste URNs (one per line or comma-separated).',
      input: { label: 'URNs (optional)', placeholder: '2302511, 2302514 …', required: false },
      confirmText: 'Issue passes',
    });
    if (input === false) return;
    const urns = String(input || '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
    const r = await attempt(() => api(`/manage/events/${ev.id}/bulk-assign`, { method: 'POST', body: { urns: urns.length ? urns : null } }));
    if (r) {
      toast.success(`${r.done} issued · ${r.skippedExisting} already had one · ${r.skippedIneligible} not eligible${r.full ? ` · ${r.full} over capacity` : ''}${r.unknown ? ` · ${r.unknown} unknown URN` : ''}`, 'Bulk issue complete');
      refresh();
    }
  };
  const exportCsv = () => attempt(() => download(`/manage/events/${ev.id}/participants.csv${qs(filters)}`, 'participants.csv'));

  const tabs = [['ALL', 'All', st.confirmed + st.pending + st.waitlisted + st.rejected + st.cancelled], ...ORDER.map((k) => [k, REG_STATUS[k].label, { PENDING: st.pending, WAITLISTED: st.waitlisted, CONFIRMED: st.confirmed, REJECTED: st.rejected, CANCELLED: st.cancelled }[k]]), ['CHECKED_IN', 'Entered', st.entered]];

  return (
    <>
      {ev.mode === 'AUTO_ASSIGN' && (
        <Alert variant="info" className="d-flex flex-wrap gap-2 align-items-center justify-content-between">
          <span className="small"><i className="bi bi-magic me-2" />Auto-assigned event: issue passes to every eligible student in one step.</span>
          <Button size="sm" onClick={bulkAssign} disabled={locked}>Issue passes</Button>
        </Alert>
      )}
      <Nav variant="pills" activeKey={status} onSelect={(k) => { setStatus(k); setPage(1); setSel(new Set()); }} className="gap-1 mb-3 flex-wrap">
        {tabs.map(([k, label, n]) => <Nav.Item key={k}><Nav.Link eventKey={k} className="py-1 px-2 small">{label} <span className="opacity-75">({n})</span></Nav.Link></Nav.Item>)}
      </Nav>
      <Panel flush>
        <Form className="filter-bar p-3 border-bottom" onSubmit={(e) => { e.preventDefault(); setSearch(q); setPage(1); }}>
          <div className="search-box">
            <i className="bi bi-search" aria-hidden="true" />
            <Form.Control type="search" size="sm" placeholder="Search name, URN or email (Enter)" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => { setSearch(q); setPage(1); }} aria-label="Search participants" />
          </div>
          <Form.Select size="sm" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Participant type">
            <option value="">All participants</option><option value="STUDENT">Students</option><option value="GUEST">Guests</option>
          </Form.Select>
          <div className="ms-auto d-flex gap-2">
            {ev.mode !== 'AUTO_ASSIGN' && <Button size="sm" variant="light" onClick={bulkAssign} disabled={locked}><i className="bi bi-people me-1" />Bulk issue</Button>}
            <Button size="sm" variant="light" onClick={exportCsv} disabled={!res.data?.total}><i className="bi bi-filetype-csv me-1" />Export CSV</Button>
          </div>
        </Form>
        {sel.size > 0 && (
          <div className="d-flex flex-wrap gap-2 align-items-center px-3 py-2 border-bottom" style={{ background: 'var(--gn-navy-50)' }} role="region" aria-label="Bulk actions">
            <strong className="small">{sel.size} selected</strong>
            <Button size="sm" variant="success" onClick={() => approve([...sel])}><i className="bi bi-check2 me-1" />Approve</Button>
            <Button size="sm" variant="outline-danger" onClick={() => reject([...sel])}><i className="bi bi-x me-1" />Reject</Button>
            <Button size="sm" variant="link" onClick={() => setSel(new Set())}>Clear</Button>
          </div>
        )}
        {res.error && !res.data ? <ErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <Loading /> : !rows.length ? (
          <EmptyState icon="people" title="No participants here">{search || type ? 'Try clearing the filters.' : 'Registrations appear here as students sign up.'}</EmptyState>
        ) : (
          <Table hover responsive className="mb-0 align-middle table-stack">
            <thead>
              <tr>
                <th style={{ width: 36 }}>{selectable.length > 0 && <Form.Check aria-label="Select all on this page" checked={allSelected} onChange={toggleAll} />}</th>
                <th>Participant</th><th>Dept / Unit</th><th>Registered</th><th>Status</th><th>Pass</th><th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const canPick = r.status === 'PENDING' || r.status === 'WAITLISTED';
                return (
                  <tr key={r.registrationId}>
                    <td className="td-check">{canPick && <Form.Check aria-label={`Select ${r.person.name}`} checked={sel.has(r.registrationId)} onChange={() => toggle(r.registrationId)} />}</td>
                    <td className="td-main">
                      <div className="d-flex gap-2 align-items-center">
                        <Avatar user={r.person} size={32} />
                        <div className="min-w-0">
                          <div className="fw-600">{r.person.name} {!r.person.enrolled && <Tag tone="danger">Not enrolled</Tag>}</div>
                          <div className="small-2 text-muted-2 mono">{r.person.idLabel}</div>
                          {r.note && <div className="small-2 fst-italic text-muted-2">“{r.note}”</div>}
                        </div>
                      </div>
                    </td>
                    <td data-label="Dept / Unit" className="small">{r.person.sub}</td>
                    <td data-label="Registered" className="small">{fmtDateTime(r.registeredAt)}</td>
                    <td data-label="Status">
                      <StatusBadge kind="reg" status={r.status} label={r.status === 'WAITLISTED' ? `Waitlist #${r.waitlistPosition}` : undefined} />
                      {r.reason && ['REJECTED', 'CANCELLED'].includes(r.status) && <div className="small-2 text-muted-2">{r.reason}</div>}
                    </td>
                    <td data-label="Pass">
                      {r.entry ? <StatusBadge kind="pass" status="USED" label={`In · ${fmtTime(r.entry.at)}`} /> : r.pass ? <StatusBadge kind="pass" status={r.pass.status} /> : <span className="text-muted-2 small">—</span>}
                    </td>
                    <td data-label="Actions" className="text-end">
                      <div className="d-flex gap-1 justify-content-end">
                        {r.status === 'PENDING' && !locked && <Button size="sm" variant="success" onClick={() => approve([r.registrationId])} aria-label={`Approve ${r.person.name}`}><i className="bi bi-check2" /></Button>}
                        {r.status === 'PENDING' && !locked && <Button size="sm" variant="outline-danger" onClick={() => reject([r.registrationId])} aria-label={`Reject ${r.person.name}`}><i className="bi bi-x" /></Button>}
                        {r.status === 'WAITLISTED' && !locked && <Button size="sm" variant="outline-primary" onClick={() => approve([r.registrationId])}>Promote</Button>}
                        {r.status === 'CONFIRMED' && !r.entry && !locked && (
                          <Dropdown align="end">
                            <Dropdown.Toggle size="sm" variant="light" aria-label={`More actions for ${r.person.name}`}><i className="bi bi-three-dots" /></Dropdown.Toggle>
                            <Dropdown.Menu>
                              {r.pass?.status === 'ACTIVE' && <Dropdown.Item onClick={() => revoke(r)}><i className="bi bi-slash-circle me-2" />Revoke pass</Dropdown.Item>}
                              <Dropdown.Item onClick={() => reissue(r)}><i className="bi bi-arrow-repeat me-2" />Issue new pass</Dropdown.Item>
                              <Dropdown.Divider />
                              <Dropdown.Item className="text-danger" onClick={() => remove(r)}><i className="bi bi-person-dash me-2" />Remove participant</Dropdown.Item>
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
        {res.data && <div className="p-2"><Pager page={res.data.page} pages={res.data.pages} onChange={setPage} /></div>}
      </Panel>
    </>
  );
}
