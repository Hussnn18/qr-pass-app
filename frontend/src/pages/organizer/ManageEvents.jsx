import { useState } from 'react';
import { Button, Dropdown, Form, Nav, ProgressBar, Table } from 'react-bootstrap';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useApi } from '../../api/useApi';
import { useCurrentUser } from '../../auth/AuthContext';
import { eventPhase } from '../../utils/events';
import { fmtDateShort, fmtTime, pct } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { EmptyState, ErrorState, Loading, ModeBadge, PageHeader, Pager, Panel, StatusBadge, Tag, paginate } from '../../components/ui';
import { attempt, confirmDialog } from '../../components/feedback';

/** Lifecycle actions (requirement O1-09). `onDone(updatedEvent | null)` refreshes the caller. */
export function EventActionsMenu({ e, onDone, align = 'end' }) {
  const navigate = useNavigate();
  const ended = e.endsAt < Date.now();
  const run = async (path, success, body) => {
    const r = await attempt(() => api(`/manage/events/${e.id}/${path}`, { method: 'POST', body }), success);
    if (r) onDone?.(r);
  };
  const publish = async () => {
    if (await confirmDialog({ title: 'Publish this event?', message: 'Eligible students will see it and can register. The server checks for venue clashes first.', confirmText: 'Publish' })) run('publish', 'Event published.');
  };
  const close = async () => {
    if (await confirmDialog({ title: 'Close registrations?', message: 'Existing passes stay valid. No new registrations will be accepted.', confirmText: 'Close registrations' })) run('close', 'Registrations closed.');
  };
  const complete = async () => {
    if (await confirmDialog({ title: 'Mark as completed?', message: 'Unused passes expire and entry records become final.', confirmText: 'Mark completed' })) run('complete', 'Event marked completed.');
  };
  const cancel = async () => {
    const reason = await confirmDialog({
      title: `Cancel “${e.title}”?`, message: 'Every pass is revoked and every registration is cancelled with your reason.',
      input: { label: 'Reason shown to participants', placeholder: 'e.g. Postponed due to exams — new date soon', required: true }, confirmText: 'Cancel event', variant: 'danger', cancelText: 'Keep event',
    });
    if (reason) run('cancel', 'Event cancelled.', { reason });
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this draft?', message: 'This cannot be undone.', confirmText: 'Delete draft', variant: 'danger' }))) return;
    if ((await attempt(() => api(`/manage/events/${e.id}`, { method: 'DELETE' }), 'Draft deleted.')) !== undefined) {
      onDone?.(null);
      navigate('/manage/events');
    }
  };
  return (
    <Dropdown align={align}>
      <Dropdown.Toggle size="sm" variant="light" aria-label={`Actions for ${e.title}`}>Actions</Dropdown.Toggle>
      <Dropdown.Menu>
        <Dropdown.Item as={Link} to={`/manage/events/${e.id}`}><i className="bi bi-gear me-2" />Manage</Dropdown.Item>
        {!['COMPLETED', 'CANCELLED'].includes(e.status) && <Dropdown.Item as={Link} to={`/manage/events/${e.id}/edit`}><i className="bi bi-pencil-square me-2" />Edit details</Dropdown.Item>}
        <Dropdown.Item as={Link} to={`/events/${e.id}`}><i className="bi bi-eye me-2" />Student view</Dropdown.Item>
        <Dropdown.Divider />
        {e.status === 'DRAFT' && <Dropdown.Item onClick={publish}><i className="bi bi-broadcast me-2" />Publish</Dropdown.Item>}
        {e.status === 'PUBLISHED' && !ended && <Dropdown.Item onClick={close}><i className="bi bi-lock me-2" />Close registrations</Dropdown.Item>}
        {e.status === 'CLOSED' && !ended && <Dropdown.Item onClick={() => run('reopen', 'Registrations reopened.')}><i className="bi bi-unlock me-2" />Reopen registrations</Dropdown.Item>}
        {['PUBLISHED', 'CLOSED'].includes(e.status) && <Dropdown.Item onClick={complete}><i className="bi bi-flag me-2" />Mark completed</Dropdown.Item>}
        {['PUBLISHED', 'CLOSED'].includes(e.status) && <Dropdown.Item className="text-danger" onClick={cancel}><i className="bi bi-x-octagon me-2" />Cancel event</Dropdown.Item>}
        {e.status === 'DRAFT' && <Dropdown.Item className="text-danger" onClick={remove}><i className="bi bi-trash me-2" />Delete draft</Dropdown.Item>}
      </Dropdown.Menu>
    </Dropdown>
  );
}

const FILTERS = [['all', 'All'], ['live', 'Live now'], ['upcoming', 'Upcoming'], ['pending', 'Needs approval'], ['draft', 'Drafts'], ['past', 'Completed'], ['cancelled', 'Cancelled']];

export default function ManageEvents() {
  const user = useCurrentUser();
  const isAdmin = user.role === 'ADMIN';
  useTitle(isAdmin ? 'All events' : 'My events');
  const res = useApi('/manage/events');
  const [params, setParams] = useSearchParams();
  const filter = params.get('filter') || 'all';
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const now = Date.now();
  const mine = res.data || [];

  const test = {
    all: () => true,
    live: (e) => eventPhase(e) === 'LIVE',
    upcoming: (e) => e.startsAt > now && ['PUBLISHED', 'CLOSED'].includes(e.status),
    pending: (e) => e.stats.pending > 0,
    draft: (e) => e.status === 'DRAFT',
    past: (e) => e.status === 'COMPLETED' || (e.endsAt < now && e.status !== 'CANCELLED'),
    cancelled: (e) => e.status === 'CANCELLED',
  };
  const list = mine.filter(test[filter]).filter((e) => !q || e.title.toLowerCase().includes(q.toLowerCase()))
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
          {FILTERS.map(([k, label]) => <Nav.Item key={k}><Nav.Link eventKey={k} className="py-1 px-2 small">{label} <span className="opacity-75">({mine.filter(test[k]).length})</span></Nav.Link></Nav.Item>)}
        </Nav>
        <div className="search-box ms-auto" style={{ maxWidth: 280 }}>
          <i className="bi bi-search" aria-hidden="true" />
          <Form.Control type="search" size="sm" placeholder="Search events" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search events" />
        </div>
      </div>
      <Panel flush>
        {res.error && !res.data ? <ErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <Loading /> : !rows.length ? (
          <EmptyState icon="calendar-x" title="No events in this list" action={<Button as={Link} to="/manage/events/new">Create event</Button>} />
        ) : (
          <Table hover responsive className="mb-0 align-middle table-stack">
            <thead><tr><th>Event</th><th>Date</th>{isAdmin && <th>Organizer</th>}<th>Mode</th><th>Registrations</th><th>Status</th><th className="text-end">Actions</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="td-main">
                    <Link to={`/manage/events/${e.id}`} className="fw-600 text-decoration-none">{e.title}</Link>
                    <div className="small-2 text-muted-2">{e.venue.name}</div>
                  </td>
                  <td data-label="Date" className="small">{fmtDateShort(e.startsAt)} · {fmtTime(e.startsAt)}</td>
                  {isAdmin && <td data-label="Organizer" className="small">{e.organizers.map((o) => o.name).join(', ')}</td>}
                  <td data-label="Mode"><ModeBadge mode={e.mode} /></td>
                  <td data-label="Registrations" style={{ minWidth: 150 }}>
                    <div className="d-flex justify-content-between small-2"><span>{e.stats.confirmed}/{e.stats.capacity}</span>{e.stats.pending > 0 && <Tag tone="warning">{e.stats.pending} pending</Tag>}</div>
                    <ProgressBar now={pct(e.stats.confirmed, e.stats.capacity)} style={{ height: 5 }} className="mt-1" aria-label="Seats filled" />
                  </td>
                  <td data-label="Status">{eventPhase(e) === 'LIVE' ? <Tag tone="danger" icon="broadcast">Live</Tag> : <StatusBadge kind="event" status={e.status} />}</td>
                  <td data-label="Actions" className="text-end"><EventActionsMenu e={e} onDone={res.reload} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
      <div className="mt-3"><Pager page={p} pages={pages} onChange={setPage} /></div>
    </>
  );
}
