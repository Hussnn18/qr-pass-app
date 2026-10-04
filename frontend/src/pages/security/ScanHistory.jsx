import { useState } from 'react';
import { Form, Table } from 'react-bootstrap';
import { useSearchParams } from 'react-router-dom';
import { SCAN_RESULTS } from '../../data/constants';
import { useStore } from '../../store/store';
import { useCurrentUser } from '../../store/session';
import { byId, managedEvents } from '../../store/selectors';
import { fmtDateTime } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { EmptyState, PageHeader, Pager, Panel, Tag, paginate } from '../../components/ui';

export default function ScanHistory() {
  useTitle('Scan history');
  const s = useStore();
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const eventId = params.get('event') || '';
  const [result, setResult] = useState('');
  const [page, setPage] = useState(1);

  const scopeIds = user.role === 'SECURITY'
    ? new Set(s.assignments.filter((a) => a.userId === user.id).map((a) => a.eventId))
    : new Set(managedEvents(s, user).map((e) => e.id));
  const events = s.events.filter((e) => scopeIds.has(e.id));
  const logs = s.scanLogs
    .filter((l) => scopeIds.has(l.eventId))
    .filter((l) => user.role !== 'SECURITY' || l.by === user.id)
    .filter((l) => !eventId || l.eventId === eventId)
    .filter((l) => !result || (result === 'FAIL' ? l.result !== 'SUCCESS' : l.result === result))
    .sort((a, b) => b.at - a.at);
  const { rows, pages, page: p } = paginate(logs, page, 20);

  return (
    <>
      <PageHeader title="Scan history" subtitle={user.role === 'SECURITY' ? 'Every scan you have made, including rejected passes.' : 'All scans at the gates of your events.'} />
      <Panel flush>
        <div className="filter-bar p-3 border-bottom">
          <Form.Select size="sm" value={eventId} onChange={(e) => { setParams(e.target.value ? { event: e.target.value } : {}); setPage(1); }} aria-label="Event" style={{ maxWidth: 340 }}>
            <option value="">All events</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </Form.Select>
          <Form.Select size="sm" value={result} onChange={(e) => { setResult(e.target.value); setPage(1); }} aria-label="Result">
            <option value="">All results</option>
            <option value="SUCCESS">Allowed only</option>
            <option value="FAIL">Rejected only</option>
            {Object.entries(SCAN_RESULTS).filter(([k]) => k !== 'SUCCESS').map(([k, v]) => <option key={k} value={k}>{v.title}</option>)}
          </Form.Select>
          <span className="small text-muted-2 ms-auto">{logs.length} scans</span>
        </div>
        {!rows.length ? <EmptyState icon="clock-history" title="No scans match" /> : (
          <Table hover responsive className="mb-0 align-middle table-stack small">
            <thead><tr><th>Time</th><th>Result</th><th>Participant</th><th>Event</th><th>Gate</th><th>By</th><th>Method</th></tr></thead>
            <tbody>
              {rows.map((l) => {
                const meta = SCAN_RESULTS[l.result];
                const u = l.participantId && byId(s.users, l.participantId);
                return (
                  <tr key={l.id}>
                    <td className="td-main">{fmtDateTime(l.at)}</td>
                    <td data-label="Result"><Tag tone={meta.tone} icon={meta.icon}>{meta.title}</Tag></td>
                    <td data-label="Participant">{u ? <>{u.name} <span className="mono text-muted-2">{u.urn || ''}</span></> : <span className="text-muted-2">Unknown</span>}</td>
                    <td data-label="Event">{byId(s.events, l.eventId)?.title}</td>
                    <td data-label="Gate">{byId(s.gates, l.gateId)?.name}</td>
                    <td data-label="By">{byId(s.users, l.by)?.name || '—'}</td>
                    <td data-label="Method">{l.method}</td>
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
