import { useState } from 'react';
import { Button, Dropdown, Form, Table } from 'react-bootstrap';
import { download, qs } from '../../api/client';
import { useApi } from '../../api/useApi';
import { fmtDateTime, titleCase } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { Avatar, EmptyState, ErrorState, Loading, PageHeader, Pager, Panel, RoleBadge, Tag } from '../../components/ui';
import { attempt } from '../../components/feedback';

const tone = (action) => (/FAILED|LOCKED|REVOKED|CANCELLED|DELETED|DEACTIVATED|ABSENT|REJECTED/.test(action) ? 'danger'
  : /MANUAL|OVERRIDE|PRESENT|RESET|EXPORTED|IMPORT/.test(action) ? 'warning' : 'secondary');

/** Audit-log viewer (objective 5, admin only). */
export default function AuditLog() {
  useTitle('Audit log');
  const [action, setAction] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const filters = {
    action, q: search, from: from ? new Date(`${from}T00:00`).getTime() : undefined, to: to ? new Date(`${to}T23:59:59`).getTime() : undefined,
  };
  const actions = useApi('/admin/audit-logs/actions');
  const res = useApi(`/admin/audit-logs${qs({ ...filters, page, size: 25 })}`);
  const set = (fn) => (e) => { fn(e.target.value); setPage(1); };
  const exportAs = (format) => attempt(() => download(`/admin/audit-logs/export${qs({ ...filters, format })}`, `audit-log.${format}`));

  return (
    <>
      <PageHeader title="Audit log" crumbs={[{ label: 'Control panel' }]}
        subtitle="Security-relevant actions: sign-ins, password and role changes, imports, approvals, cancellations, manual gate entries, attendance corrections and report downloads."
        actions={(
          <Dropdown align="end">
            <Dropdown.Toggle variant="outline-primary"><i className="bi bi-download me-1" />Export</Dropdown.Toggle>
            <Dropdown.Menu>
              <Dropdown.Item onClick={() => exportAs('xlsx')}><i className="bi bi-file-earmark-spreadsheet me-2" />Excel</Dropdown.Item>
              <Dropdown.Item onClick={() => exportAs('csv')}><i className="bi bi-filetype-csv me-2" />CSV</Dropdown.Item>
              <Dropdown.Item onClick={() => exportAs('pdf')}><i className="bi bi-file-earmark-pdf me-2" />PDF</Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        )} />
      <Panel flush>
        <Form className="filter-bar p-3 border-bottom" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); setPage(1); }}>
          <div className="search-box">
            <i className="bi bi-search" aria-hidden="true" />
            <Form.Control type="search" size="sm" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q.trim() !== search && (setSearch(q.trim()), setPage(1))}
              placeholder="Person, URN, details…" aria-label="Search the audit log" />
          </div>
          <Form.Select size="sm" value={action} onChange={set(setAction)} aria-label="Action" style={{ width: 'auto' }}>
            <option value="">All actions</option>
            {(actions.data || []).map((a) => <option key={a} value={a}>{titleCase(a)}</option>)}
          </Form.Select>
          <Form.Control size="sm" type="date" value={from} onChange={set(setFrom)} aria-label="From date" style={{ width: 'auto' }} />
          <Form.Control size="sm" type="date" value={to} onChange={set(setTo)} aria-label="To date" style={{ width: 'auto' }} />
          {(action || search || from || to) && <Button size="sm" variant="link" onClick={() => { setAction(''); setQ(''); setSearch(''); setFrom(''); setTo(''); setPage(1); }}>Clear</Button>}
          {res.data && <span className="small text-muted-2 ms-auto">{res.data.total} entries</span>}
        </Form>
        {res.error && !res.data ? <ErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <Loading /> : !res.data.items.length ? <EmptyState icon="journal" title="No entries match" /> : (
          <Table hover responsive className="mb-0 align-middle table-stack small">
            <thead><tr><th>Time</th><th>Action</th><th>By</th><th>Details</th><th>IP</th></tr></thead>
            <tbody>
              {res.data.items.map((a) => (
                <tr key={a.id}>
                  <td className="td-main text-nowrap">{fmtDateTime(a.at)}</td>
                  <td data-label="Action"><Tag tone={tone(a.action)}>{titleCase(a.action)}</Tag></td>
                  <td data-label="By">
                    {a.actor ? (
                      <div className="d-flex gap-2 align-items-center">
                        <Avatar user={a.actor} size={26} />
                        <div className="min-w-0"><div className="fw-600 text-truncate">{a.actor.name}</div><RoleBadge role={a.actor.role} /></div>
                      </div>
                    ) : <span className="text-muted-2">System / not signed in</span>}
                  </td>
                  <td data-label="Details" style={{ maxWidth: 420 }}>
                    <div className="text-break">{a.details || '—'}</div>
                    {a.entityType && <div className="small-2 text-muted-2">{a.entityType}{a.entityId ? ` #${a.entityId}` : ''}</div>}
                  </td>
                  <td data-label="IP" className="mono small-2">{a.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {res.data && <div className="p-2"><Pager page={res.data.page} pages={res.data.pages} onChange={setPage} /></div>}
      </Panel>
    </>
  );
}
