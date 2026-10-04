import { Button, Nav, Table } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useApi } from '../../api/useApi';
import { fmtDateShort, fmtDateTime, fmtTime } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { EmptyState, ErrorState, Loading, PageHeader, Panel, StatusBadge } from '../../components/ui';
import { attempt, confirmDialog } from '../../components/feedback';

const TABS = [
  ['upcoming', 'Upcoming'],
  ['pending', 'Pending & waitlist'],
  ['past', 'Past'],
  ['closed', 'Cancelled & not approved'],
];

export default function MyRegistrations() {
  useTitle('My registrations');
  const res = useApi('/me/registrations');
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'upcoming';
  const now = Date.now();

  const bucket = (r) => {
    if (r.status === 'CANCELLED' || r.status === 'REJECTED') return 'closed';
    if (r.event.endsAt < now || r.event.status === 'COMPLETED') return 'past';
    if (r.status === 'PENDING' || r.status === 'WAITLISTED') return 'pending';
    return 'upcoming';
  };
  const all = res.data || [];
  const counts = Object.fromEntries(TABS.map(([k]) => [k, all.filter((x) => bucket(x) === k).length]));
  const rows = all.filter((x) => bucket(x) === tab).sort((a, b) => (tab === 'past' || tab === 'closed' ? b.event.startsAt - a.event.startsAt : a.event.startsAt - b.event.startsAt));

  const cancel = async (r) => {
    const yes = await confirmDialog({ title: 'Cancel this registration?', message: `${r.event.title} — your pass will stop working.`, confirmText: 'Cancel registration', variant: 'danger', cancelText: 'Keep it' });
    if (!yes) return;
    await attempt(() => api(`/me/registrations/${r.id}/cancel`, { method: 'POST' }), (x) => x.message);
    res.reload();
  };

  return (
    <>
      <PageHeader title="My registrations" subtitle="Every request from sign-up to entry." actions={<Button as={Link} to="/events" variant="outline-primary"><i className="bi bi-search me-1" />Find events</Button>} />
      <Nav variant="tabs" activeKey={tab} onSelect={(k) => setParams({ tab: k })}>
        {TABS.map(([k, label]) => (
          <Nav.Item key={k}><Nav.Link eventKey={k}>{label} <span className="badge rounded-pill text-bg-light border ms-1">{counts[k]}</span></Nav.Link></Nav.Item>
        ))}
      </Nav>
      <Panel flush className="border-top-0">
        {res.error && !res.data ? <ErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <Loading /> : !rows.length ? (
          <EmptyState icon="card-checklist" title="Nothing here yet">
            {tab === 'upcoming' ? 'Confirmed registrations for upcoming events appear here.' : 'No registrations in this list.'}
          </EmptyState>
        ) : (
          <Table hover responsive className="mb-0 align-middle table-stack">
            <thead><tr><th>Event</th><th>When</th><th>Registered</th><th>Status</th><th className="text-end">Actions</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="td-main">
                    <Link to={`/events/${r.event.id}`} className="fw-600 text-decoration-none">{r.event.title}</Link>
                    <div className="small-2 text-muted-2">{r.event.venueName}</div>
                  </td>
                  <td data-label="When">{fmtDateShort(r.event.startsAt)}, {fmtTime(r.event.startsAt)}</td>
                  <td data-label="Registered" className="small">{fmtDateTime(r.registeredAt)}</td>
                  <td data-label="Status">
                    <div className="d-flex flex-column gap-1 align-items-end align-items-md-start">
                      {r.entry ? <StatusBadge kind="pass" status="USED" label={`Entered · ${fmtTime(r.entry.at)}`} />
                        : <StatusBadge kind="reg" status={r.status} label={r.status === 'WAITLISTED' ? `Waitlist #${r.waitlistPosition}` : undefined} />}
                      {r.reason && (r.status === 'REJECTED' || r.status === 'CANCELLED') && <span className="small-2 text-muted-2">{r.reason}</span>}
                      {tab === 'past' && !r.entry && r.status === 'CONFIRMED' && <span className="small-2 text-danger">Did not enter</span>}
                    </div>
                  </td>
                  <td data-label="Actions" className="text-end">
                    <div className="d-flex gap-2 justify-content-end flex-wrap">
                      {r.pass?.status === 'ACTIVE' && <Button size="sm" as={Link} to={`/my/passes?open=${r.pass.id}`}><i className="bi bi-qr-code me-1" />Pass</Button>}
                      {['CONFIRMED', 'PENDING', 'WAITLISTED'].includes(r.status) && !r.entry && r.event.startsAt > now && (
                        <Button size="sm" variant="outline-danger" onClick={() => cancel(r)}>Cancel</Button>
                      )}
                      <Button size="sm" variant="light" as={Link} to={`/events/${r.event.id}`}>Details</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
