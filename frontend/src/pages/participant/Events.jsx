import { useState } from 'react';
import { Button, ButtonGroup, Col, Form, Row, Table } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router-dom';
import { qs } from '../../api/client';
import { useApi } from '../../api/useApi';
import { CATEGORIES } from '../../data/constants';
import { useCurrentUser } from '../../auth/AuthContext';
import { eventPhase } from '../../utils/events';
import { fmtDateShort, fmtTime } from '../../utils/format';
import { usePersistentState, useTitle } from '../../utils/hooks';
import { EmptyState, ErrorState, Loading, PageHeader, Pager, Panel, StatusBadge, Tag } from '../../components/ui';
import EventCard from '../../components/EventCard';

const WHEN = { upcoming: 'Upcoming', week: 'Next 7 days', month: 'Next 30 days', past: 'Past events', all: 'All dates' };

export default function Events() {
  useTitle('Browse events');
  const user = useCurrentUser();
  const student = user.role === 'STUDENT';
  const [params, setParams] = useSearchParams();
  const [view, setView] = usePersistentState('scems_events_view', 'grid');
  const [q, setQ] = useState(params.get('q') || '');
  const filters = {
    q: params.get('q') || '',
    category: params.get('category') || '',
    when: params.get('when') || 'upcoming',
    eligibleOnly: params.get('eligibleOnly') === '1',
    openOnly: params.get('openOnly') === '1',
    page: Number(params.get('page') || 1),
  };
  const set = (patch) => {
    const next = { ...filters, page: 1, ...patch };
    setParams(Object.fromEntries(Object.entries({ ...next, eligibleOnly: next.eligibleOnly ? '1' : '', openOnly: next.openOnly ? '1' : '', page: next.page > 1 ? next.page : '' })
      .filter(([, v]) => v !== '' && v !== false && !(v === 'upcoming'))));
  };
  const list = useApi(`/events${qs({ q: filters.q, category: filters.category, when: filters.when, eligibleOnly: filters.eligibleOnly, openOnly: filters.openOnly, page: filters.page, size: 9 })}`);
  const data = list.data;

  return (
    <>
      <PageHeader title="Browse events" subtitle={student ? 'Find events, check whether you are eligible, and register in one step.' : 'Published events, as students see them.'} />
      <Panel className="mb-3">
        <Form className="filter-bar" onSubmit={(e) => { e.preventDefault(); set({ q }); }}>
          <div className="search-box">
            <i className="bi bi-search" aria-hidden="true" />
            <Form.Control type="search" placeholder="Search by name, topic or venue" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q !== filters.q && set({ q })} aria-label="Search events" />
          </div>
          <Form.Select value={filters.category} onChange={(e) => set({ category: e.target.value })} aria-label="Category">
            <option value="">All categories</option>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Form.Select>
          <Form.Select value={filters.when} onChange={(e) => set({ when: e.target.value })} aria-label="Date range">
            {Object.entries(WHEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Form.Select>
          {student && <Form.Check type="switch" id="f-elig" label="Only events I can join" checked={filters.eligibleOnly} onChange={(e) => set({ eligibleOnly: e.target.checked })} />}
          <Form.Check type="switch" id="f-open" label="Open with seats left" checked={filters.openOnly} onChange={(e) => set({ openOnly: e.target.checked })} />
          <ButtonGroup className="ms-auto" aria-label="Layout">
            <Button variant={view === 'grid' ? 'primary' : 'light'} onClick={() => setView('grid')} aria-pressed={view === 'grid'} aria-label="Grid view"><i className="bi bi-grid-3x3-gap" /></Button>
            <Button variant={view === 'list' ? 'primary' : 'light'} onClick={() => setView('list')} aria-pressed={view === 'list'} aria-label="List view"><i className="bi bi-list-ul" /></Button>
          </ButtonGroup>
        </Form>
      </Panel>

      {list.error && !data ? <ErrorState error={list.error} onRetry={list.reload} /> : !data ? <Loading /> : (
        <>
          <div className="small text-muted-2 mb-2" aria-live="polite">{data.total} event{data.total === 1 ? '' : 's'} found</div>
          {!data.items.length ? (
            <Panel>
              <EmptyState icon="calendar-x" title="No events match these filters" action={<Button variant="outline-primary" onClick={() => { setQ(''); setParams({}); }}>Clear filters</Button>}>
                Try a different category or date range.
              </EmptyState>
            </Panel>
          ) : view === 'grid' ? (
            <Row className="g-3">
              {data.items.map((e) => <Col sm={6} lg={4} key={e.id}><EventCard event={e} /></Col>)}
            </Row>
          ) : (
            <Panel flush>
              <Table hover responsive className="mb-0 align-middle table-stack">
                <thead><tr><th>Event</th><th>Date</th><th>Venue</th><th>Seats</th><th>Status</th></tr></thead>
                <tbody>
                  {data.items.map((e) => {
                    const reg = e.myRegistration;
                    return (
                      <tr key={e.id}>
                        <td className="td-main">
                          <Link to={`/events/${e.id}`} className="fw-600 text-decoration-none">{e.title}</Link>
                          <div className="small-2 text-muted-2">{CATEGORIES[e.category].label}{eventPhase(e) === 'LIVE' && <span className="text-danger fw-600"> · Live now</span>}</div>
                        </td>
                        <td data-label="Date">{fmtDateShort(e.startsAt)}, {fmtTime(e.startsAt)}</td>
                        <td data-label="Venue">{e.venue.name}</td>
                        <td data-label="Seats">{e.stats.remaining > 0 ? `${e.stats.remaining} left` : <span className="text-danger">Full</span>}</td>
                        <td data-label="Status">
                          {e.status !== 'PUBLISHED' ? <StatusBadge kind="event" status={e.status} />
                            : reg && reg.status !== 'CANCELLED' ? <StatusBadge kind="reg" status={reg.status} />
                              : e.eligibilityCheck ? (e.eligibilityCheck.eligible ? <Tag tone="success" icon="check2">Eligible</Tag> : <Tag icon="slash-circle">Not eligible</Tag>)
                                : <StatusBadge kind="event" status={e.status} />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Panel>
          )}
          <div className="mt-3"><Pager page={data.page} pages={data.pages} onChange={(p) => set({ page: p })} /></div>
        </>
      )}
    </>
  );
}
