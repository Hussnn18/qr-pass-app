import { useMemo, useState } from 'react';
import { Button, Form, Table } from 'react-bootstrap';
import { ROLES } from '../../data/constants';
import { useStore } from '../../store/store';
import { byId } from '../../store/selectors';
import { logExport } from '../../store/actions';
import { fmtDateTime, fromNow, titleCase } from '../../utils/format';
import { downloadText, toCSV } from '../../utils/files';
import { useTitle } from '../../utils/hooks';
import { EmptyState, PageHeader, Pager, Panel, Tag, paginate } from '../../components/ui';

const toneFor = (action) => (/FAIL|LOCK|CANCEL|REJECT|REVOK|DELETE|DEACTIV|SUSPEND|REMOVED/.test(action) ? 'danger' : /OVERRIDE|MANUAL|RESET|EXPORT/.test(action) ? 'warning' : /LOGIN|LOGOUT/.test(action) ? 'secondary' : 'primary');

export default function AuditLog() {
  useTitle('Audit log');
  const s = useStore();
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [role, setRole] = useState('');
  const [days, setDays] = useState('all');
  const [page, setPage] = useState(1);
  const actions = useMemo(() => [...new Set(s.audit.map((a) => a.action))].sort(), [s.audit]);

  const list = s.audit
    .filter((a) => !action || a.action === action)
    .filter((a) => !role || byId(s.users, a.actorId)?.role === role)
    .filter((a) => days === 'all' || a.at > Date.now() - Number(days) * 864e5)
    .filter((a) => !q || `${a.details} ${byId(s.users, a.actorId)?.name || ''} ${a.action}`.toLowerCase().includes(q.toLowerCase()));
  const { rows, pages, page: p } = paginate(list, page, 20);
  const reset = (fn) => (e) => { fn(e.target.value); setPage(1); };

  const exportCSV = () => {
    downloadText('audit_log.csv', toCSV(list, [
      { label: 'Time', value: (a) => fmtDateTime(a.at) }, { label: 'Actor', value: (a) => byId(s.users, a.actorId)?.name || 'System' },
      { label: 'Role', value: (a) => byId(s.users, a.actorId)?.role || '' }, { label: 'Action', value: (a) => a.action },
      { label: 'Entity', value: (a) => a.entity }, { label: 'Details', value: (a) => a.details }, { label: 'IP', value: (a) => a.ip },
    ]));
    logExport(`Audit log CSV · ${list.length} rows`);
  };

  return (
    <>
      <PageHeader title="Audit log" crumbs={[{ label: 'Control panel' }]} subtitle="Sign-ins, approvals, pass changes, manual check-ins, imports and exports. Entries cannot be edited." actions={<Button variant="outline-primary" onClick={exportCSV}><i className="bi bi-filetype-csv me-1" />Export CSV</Button>} />
      <Panel flush>
        <div className="filter-bar p-3 border-bottom">
          <div className="search-box"><i className="bi bi-search" aria-hidden="true" /><Form.Control size="sm" type="search" value={q} onChange={reset(setQ)} placeholder="Search details or person" aria-label="Search audit log" /></div>
          <Form.Select size="sm" value={action} onChange={reset(setAction)} aria-label="Action"><option value="">All actions</option>{actions.map((a) => <option key={a} value={a}>{titleCase(a)}</option>)}</Form.Select>
          <Form.Select size="sm" value={role} onChange={reset(setRole)} aria-label="Actor role"><option value="">Any role</option>{Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Form.Select>
          <Form.Select size="sm" value={days} onChange={reset(setDays)} aria-label="Period"><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="all">All time</option></Form.Select>
          <span className="small text-muted-2 ms-auto">{list.length} entries</span>
        </div>
        {!rows.length ? <EmptyState icon="journal-x" title="No entries match" /> : (
          <Table hover responsive className="mb-0 align-middle table-stack small">
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Details</th><th>IP</th></tr></thead>
            <tbody>
              {rows.map((a) => {
                const actor = byId(s.users, a.actorId);
                return (
                  <tr key={a.id}>
                    <td className="td-main" title={fmtDateTime(a.at)}>{fmtDateTime(a.at)}<div className="small-2 text-muted-2">{fromNow(a.at)}</div></td>
                    <td data-label="Actor">{actor ? <>{actor.name}<div className="small-2 text-muted-2">{ROLES[actor.role].label}</div></> : <span className="text-muted-2">System / anonymous</span>}</td>
                    <td data-label="Action"><Tag tone={toneFor(a.action)}>{titleCase(a.action)}</Tag></td>
                    <td data-label="Details" style={{ maxWidth: 420 }}>{a.details || '—'}{a.entity && <div className="small-2 text-muted-2">{a.entity}{a.entityId ? ` · ${a.entityId}` : ''}</div>}</td>
                    <td data-label="IP" className="mono small-2">{a.ip}</td>
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
