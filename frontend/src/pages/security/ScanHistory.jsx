import { Form, Table } from 'react-bootstrap';
import { useSearchParams } from 'react-router-dom';
import { qs } from '../../api/client';
import { useApi } from '../../api/useApi';
import { SCAN_RESULTS } from '../../data/constants';
import { useCurrentUser } from '../../auth/AuthContext';
import { fmtDateTime } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { EmptyState, ErrorState, Loading, PageHeader, Pager, Panel, Tag } from '../../components/ui';

/** Every scan attempt (O3-10): security staff see their own; organizers see their events'; admins see all. */
export default function ScanHistory() {
  useTitle('Scan history');
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const eventId = params.get('eventId') || '';
  const result = params.get('result') || '';
  const page = Number(params.get('page') || 1);
  const set = (patch) => setParams(Object.fromEntries(Object.entries({ eventId, result, ...patch }).filter(([, v]) => v)));
  const options = useApi('/scan/assignments?includePast=true');
  const res = useApi(`/scan/history${qs({ eventId, result, page, size: 20 })}`);
  const events = [...new Map((options.data || []).map((o) => [o.event.id, o.event])).values()];

  return (
    <>
      <PageHeader title="Scan history" subtitle={user.role === 'SECURITY' ? 'Every scan you have made, including refused passes.' : 'All scans at the gates of your events.'} />
      <Panel flush>
        <div className="filter-bar p-3 border-bottom">
          <Form.Select size="sm" value={eventId} onChange={(e) => set({ eventId: e.target.value, page: '' })} aria-label="Event" style={{ maxWidth: 340 }}>
            <option value="">All events</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </Form.Select>
          <Form.Select size="sm" value={result} onChange={(e) => set({ result: e.target.value, page: '' })} aria-label="Result">
            <option value="">All results</option>
            <option value="SUCCESS">Allowed only</option>
            <option value="FAIL">Refused only</option>
            {Object.entries(SCAN_RESULTS).filter(([k]) => k !== 'SUCCESS').map(([k, v]) => <option key={k} value={k}>{v.title}</option>)}
          </Form.Select>
          {res.data && <span className="small text-muted-2 ms-auto">{res.data.total} scans</span>}
        </div>
        {res.error && !res.data ? <ErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <Loading /> : !res.data.items.length ? <EmptyState icon="clock-history" title="No scans match" /> : (
          <Table hover responsive className="mb-0 align-middle table-stack small">
            <thead><tr><th>Time</th><th>Result</th><th>Participant</th><th>Event</th><th>Gate</th><th>By</th><th>Method</th></tr></thead>
            <tbody>
              {res.data.items.map((l) => {
                const meta = SCAN_RESULTS[l.result] || SCAN_RESULTS.INVALID_TOKEN;
                return (
                  <tr key={l.id}>
                    <td className="td-main">{fmtDateTime(l.at)}</td>
                    <td data-label="Result"><Tag tone={meta.tone} icon={meta.icon}>{meta.title}</Tag></td>
                    <td data-label="Participant">{l.participant ? <>{l.participant.name} <span className="mono text-muted-2">{l.participant.idLabel}</span></> : <span className="text-muted-2">Unknown</span>}</td>
                    <td data-label="Event">{l.eventTitle}</td>
                    <td data-label="Gate">{l.gateName}</td>
                    <td data-label="By">{l.scannedBy || '—'}</td>
                    <td data-label="Method">{l.method === 'MANUAL' ? 'Typed code' : 'QR'}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {res.data && <div className="p-2"><Pager page={res.data.page} pages={res.data.pages} onChange={(p) => set({ page: p > 1 ? String(p) : '' })} /></div>}
      </Panel>
    </>
  );
}
