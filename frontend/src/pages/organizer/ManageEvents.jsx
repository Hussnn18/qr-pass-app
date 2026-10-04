import { useState } from 'react';
import { Button, Dropdown, Form, Nav, ProgressBar, Table } from 'react-bootstrap';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../../store/store';
import { useCurrentUser } from '../../store/session';
import { byId, eventStats, managedEvents } from '../../store/selectors';
import { deleteEvent, setEventStatus } from '../../store/actions';
import { eventPhase } from '../../utils/eligibility';
import { fmtDateShort, fmtTime } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { EmptyState, ModeBadge, PageHeader, Pager, Panel, StatusBadge, Tag, paginate } from '../../components/ui';
import { confirmDialog, toast } from '../../components/feedback';

const FILTERS = [
  ['all', 'All'], ['live', 'Live now'], ['upcoming', 'Upcoming'], ['pending', 'Needs approval'], ['draft', 'Drafts'], ['past', 'Completed'], ['cancelled', 'Cancelled'],
];

export function useEventActions() {
  const navigate = useNavigate();
  return {
    publish: async (e) => { if (await confirmDialog({ title: 'Publish this event?', message: 'Eligible students will be able to see and register for it.', confirmText: 'Publish' })) toast.result(setEventStatus(e.id, 'PUBLISHED')); },
    close: async (e) => { if (await confirmDialog({ title: 'Close registrations?', message: 'Existing passes stay valid. No new registrations will be accepted.', confirmText: 'Close registrations' })) toast.result(setEventStatus(e.id, 'CLOSED')); },
    reopen: (e) => toast.result(setEventStatus(e.id, 'PUBLISHED')),
    complete: async (e) => { if (await confirmDialog({ title: 'Mark as completed?', message: 'Unused passes will expire. Attendance becomes final for reports.', confirmText: 'Mark completed' })) toast.result(setEventStatus(e.id, 'COMPLETED')); },
    cancel: async (e) => {
      const reason = await confirmDialog({
        title: `Cancel “${e.title}”?`, message: 'All passes are revoked and every registrant is notified with your reason.',
        input: { label: 'Reason shown to participants', placeholder: 'e.g. Postponed due to exams — new date soon', required: true }, confirmText: 'Cancel event', variant: 'danger', cancelText: 'Keep event',
      });
      if (reason) toast.result(setEventStatus(e.id, 'CANCELLED', reason));
    },
    remove: async (e) => {
      if (await confirmDialog({ title: 'Delete this draft?', message: 'This cannot be undone.', confirmText: 'Delete draft', variant: 'danger' })) {
        const r = deleteEvent(e.id);
        toast.result(r);
        if (r.ok) navigate('/manage/events');
      }
    },
  };
}

export function EventActionsMenu({ e, align = 'end' }) {
  const a = useEventActions();
  const ended = e.endsAt < Date.now();
  return (
    <Dropdown align={align}>
      <Dropdown.Toggle size="sm" variant="light" aria-label={`Actions for ${e.title}`}>Actions</Dropdown.Toggle>
      <Dropdown.Menu>
        <Dropdown.Item as={Link} to={`/manage/events/${e.id}`}><i className="bi bi-gear me-2" />Manage</Dropdown.Item>
        {!['COMPLETED', 'CANCELLED'].includes(e.status) && <Dropdown.Item as={Link} to={`/manage/events/${e.id}/edit`}><i className="bi bi-pencil-square me-2" />Edit details</Dropdown.Item>}
        <Dropdown.Item as={Link} to={`/events/${e.id}`}><i className="bi bi-eye me-2" />View as participant</Dropdown.Item>
        <Dropdown.Divider />
        {e.status === 'DRAFT' && <Dropdown.Item onClick={() => a.publish(e)}><i className="bi bi-broadcast me-2" />Publish</Dropdown.Item>}
        {e.status === 'PUBLISHED' && !ended && <Dropdown.Item onClick={() => a.close(e)}><i className="bi bi-lock me-2" />Close registrations</Dropdown.Item>}
        {e.status === 'CLOSED' && !ended && <Dropdown.Item onClick={() => a.reopen(e)}><i className="bi bi-unlock me-2" />Reopen registrations</Dropdown.Item>}
        {['PUBLISHED', 'CLOSED'].includes(e.status) && <Dropdown.Item onClick={() => a.complete(e)}><i className="bi bi-flag me-2" />Mark completed</Dropdown.Item>}
        {!['COMPLETED', 'CANCELLED', 'DRAFT'].includes(e.status) && <Dropdown.Item className="text-danger" onClick={() => a.cancel(e)}><i className="bi bi-x-octagon me-2" />Cancel event</Dropdown.Item>}
        {e.status === 'DRAFT' && <Dropdown.Item className="text-danger" onClick={() => a.remove(e)}><i className="bi bi-trash me-2" />Delete draft</Dropdown.Item>}
      </Dropdown.Menu>
    </Dropdown>
  );
}

export default function ManageEvents() {
  const s = useStore();
  const user = useCurrentUser();
  const isAdmin = user.role === 'ADMIN';
  useTitle(isAdmin ? 'All events' : 'My events');
  const [params, setParams] = useSearchParams();
  const filter = params.get('filter') || 'all';
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const now = Date.now();
  const mine = managedEvents(s, user);

  const test = {
    all: () => true,
    live: (e) => eventPhase(e) === 'LIVE',
    upcoming: (e) => e.startsAt > now && ['PUBLISHED', 'CLOSED'].includes(e.status),
    pending: (e) => eventStats(s, e.id).pending > 0,
    draft: (e) => e.status === 'DRAFT',
    past: (e) => e.status === 'COMPLETED' || (e.endsAt < now && e.status !== 'CANCELLED'),
    cancelled: (e) => e.status === 'CANCELLED',
  };
  const list = mine
    .filter(test[filter])
    .filter((e) => !q || e.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (filter === 'past' ? b.startsAt - a.startsAt : a.startsAt - b.startsAt));
  const { rows, pages, page: p } = paginate(list, page, 10);

  return (
    <>
      <PageHeader
        title={isAdmin ? 'All events' : 'My events'}
        subtitle={isAdmin ? 'Every event on the platform, across organizers.' : 'Events you organise or co-organise.'}
        actions={<Button as={Link} to="/manage/events/new" variant="brand"><i className="bi bi-calendar-plus me-1" />Create event</Button>}
      />
      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <Nav variant="pills" activeKey={filter} onSelect={(k) => { setParams({ filter: k }); setPage(1); }} className="gap-1 flex-wrap">
          {FILTERS.map(([k, label]) => {
            const n = mine.filter(test[k]).length;
            return <Nav.Item key={k}><Nav.Link eventKey={k} className="py-1 px-2 small">{label} <span className="opacity-75">({n})</span></Nav.Link></Nav.Item>;
          })}
        </Nav>
        <div className="search-box ms-auto" style={{ maxWidth: 280 }}>
          <i className="bi bi-search" aria-hidden="true" />
          <Form.Control type="search" size="sm" placeholder="Search events" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search events" />
        </div>
      </div>
      <Panel flush>
        {!rows.length ? (
          <EmptyState icon="calendar-x" title="No events in this list" action={<Button as={Link} to="/manage/events/new">Create event</Button>} />
        ) : (
          <Table hover responsive className="mb-0 align-middle table-stack">
            <thead>
              <tr><th>Event</th><th>Date</th>{isAdmin && <th>Organizer</th>}<th>Mode</th><th>Registrations</th><th>Status</th><th className="text-end">Actions</th></tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const st = eventStats(s, e.id);
                return (
                  <tr key={e.id}>
                    <td className="td-main">
                      <Link to={`/manage/events/${e.id}`} className="fw-600 text-decoration-none">{e.title}</Link>
                      <div className="small-2 text-muted-2">{byId(s.locations, e.venueId)?.name}</div>
                    </td>
                    <td data-label="Date" className="small">{fmtDateShort(e.startsAt)}<br className="d-none d-md-inline" /> {fmtTime(e.startsAt)}</td>
                    {isAdmin && <td data-label="Organizer" className="small">{e.organizerIds.map((o) => byId(s.users, o)?.name).join(', ')}</td>}
                    <td data-label="Mode"><ModeBadge mode={e.mode} /></td>
                    <td data-label="Registrations" style={{ minWidth: 150 }}>
                      <div className="d-flex justify-content-between small-2"><span>{st.approved}/{e.capacity}</span>{st.pending > 0 && <Tag tone="warning">{st.pending} pending</Tag>}</div>
                      <ProgressBar now={st.fill} style={{ height: 5 }} className="mt-1" aria-label={`${st.fill}% full`} />
                    </td>
                    <td data-label="Status">{eventPhase(e) === 'LIVE' ? <Tag tone="danger" icon="broadcast">Live</Tag> : <StatusBadge kind="event" status={e.status} />}</td>
                    <td data-label="Actions" className="text-end"><EventActionsMenu e={e} /></td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>
      <div className="mt-3"><Pager page={p} pages={pages} onChange={setPage} /></div>
    </>
  );
}
