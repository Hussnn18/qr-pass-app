import { Button, Nav, Table } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../../store/store';
import { useCurrentUser } from '../../store/session';
import { byId, passForRegistration, waitlistPosition } from '../../store/selectors';
import { cancelMyRegistration } from '../../store/actions';
import { fmtDateShort, fmtDateTime, fmtTime } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { EmptyState, PageHeader, Panel, StatusBadge } from '../../components/ui';
import { confirmDialog, toast } from '../../components/feedback';

const TABS = [
  ['upcoming', 'Upcoming'],
  ['pending', 'Pending & waitlist'],
  ['past', 'Past'],
  ['closed', 'Cancelled & not approved'],
];

export default function MyRegistrations() {
  useTitle('My registrations');
  const s = useStore();
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'upcoming';
  const now = Date.now();

  const all = s.registrations
    .filter((r) => r.userId === user.id)
    .map((r) => ({ r, ev: byId(s.events, r.eventId) }))
    .filter((x) => x.ev);
  const bucket = ({ r, ev }) => {
    if (r.status === 'CANCELLED' || r.status === 'REJECTED') return 'closed';
    if (ev.endsAt < now || ev.status === 'COMPLETED') return 'past';
    if (r.status === 'PENDING' || r.status === 'WAITLISTED') return 'pending';
    return 'upcoming';
  };
  const counts = Object.fromEntries(TABS.map(([k]) => [k, all.filter((x) => bucket(x) === k).length]));
  const rows = all.filter((x) => bucket(x) === tab).sort((a, b) => (tab === 'past' || tab === 'closed' ? b.ev.startsAt - a.ev.startsAt : a.ev.startsAt - b.ev.startsAt));

  const cancel = async (r, ev) => {
    const yes = await confirmDialog({ title: 'Cancel this registration?', message: `${ev.title} — your pass will stop working.`, confirmText: 'Cancel registration', variant: 'danger', cancelText: 'Keep it' });
    if (yes) toast.result(cancelMyRegistration(r.id));
  };

  return (
    <>
      <PageHeader title="My registrations" subtitle="Track every request from sign-up to check-in." actions={<Button as={Link} to="/events" variant="outline-primary"><i className="bi bi-search me-1" />Find events</Button>} />
      <Nav variant="tabs" activeKey={tab} onSelect={(k) => setParams({ tab: k })} className="mb-0">
        {TABS.map(([k, label]) => (
          <Nav.Item key={k}><Nav.Link eventKey={k}>{label} <span className="badge rounded-pill text-bg-light border ms-1">{counts[k]}</span></Nav.Link></Nav.Item>
        ))}
      </Nav>
      <Panel flush className="border-top-0" >
        {!rows.length ? (
          <EmptyState icon="card-checklist" title="Nothing here yet">
            {tab === 'upcoming' ? 'Confirmed registrations for upcoming events appear here.' : 'No registrations in this list.'}
          </EmptyState>
        ) : (
          <Table hover responsive className="mb-0 align-middle table-stack">
            <thead><tr><th>Event</th><th>When</th><th>Registered</th><th>Status</th><th className="text-end">Actions</th></tr></thead>
            <tbody>
              {rows.map(({ r, ev }) => {
                const pass = passForRegistration(s, r.id);
                const att = s.attendance.find((a) => a.registrationId === r.id);
                return (
                  <tr key={r.id}>
                    <td className="td-main">
                      <Link to={`/events/${ev.id}`} className="fw-600 text-decoration-none">{ev.title}</Link>
                      <div className="small-2 text-muted-2">{byId(s.locations, ev.venueId)?.name}</div>
                    </td>
                    <td data-label="When">{fmtDateShort(ev.startsAt)}, {fmtTime(ev.startsAt)}</td>
                    <td data-label="Registered" className="small">{fmtDateTime(r.registeredAt)}</td>
                    <td data-label="Status">
                      <div className="d-flex flex-column gap-1 align-items-end align-items-md-start">
                        {att ? <StatusBadge kind="pass" status="USED" label={`Attended · ${fmtTime(att.at)}`} /> : <StatusBadge kind="reg" status={r.status} label={r.status === 'WAITLISTED' ? `Waitlist #${waitlistPosition(s, r)}` : undefined} />}
                        {r.reason && (r.status === 'REJECTED' || r.status === 'CANCELLED') && <span className="small-2 text-muted-2">{r.reason}</span>}
                        {tab === 'past' && !att && r.status === 'APPROVED' && <span className="small-2 text-danger">Not checked in</span>}
                      </div>
                    </td>
                    <td data-label="Actions" className="text-end">
                      <div className="d-flex gap-2 justify-content-end flex-wrap">
                        {pass?.status === 'ACTIVE' && <Button size="sm" as={Link} to={`/my/passes?open=${pass.id}`}><i className="bi bi-qr-code me-1" />Pass</Button>}
                        {['APPROVED', 'PENDING', 'WAITLISTED'].includes(r.status) && ev.startsAt > now && (
                          <Button size="sm" variant="outline-danger" onClick={() => cancel(r, ev)}>Cancel</Button>
                        )}
                        <Button size="sm" variant="light" as={Link} to={`/events/${ev.id}`}>Details</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
