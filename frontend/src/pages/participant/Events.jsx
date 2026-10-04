import { useMemo, useState } from 'react';
import { Button, ButtonGroup, Col, Form, Row, Table } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router-dom';
import { CATEGORIES } from '../../data/constants';
import { useStore } from '../../store/store';
import { useCurrentUser } from '../../store/session';
import { byId, eventStats, myRegistration, visibleEvents } from '../../store/selectors';
import { checkEligibility, eventPhase, registrationWindow } from '../../utils/eligibility';
import { fmtDateShort, fmtTime } from '../../utils/format';
import { usePersistentState, useTitle } from '../../utils/hooks';
import { EmptyState, PageHeader, Pager, Panel, StatusBadge, Tag, paginate } from '../../components/ui';
import EventCard from '../../components/EventCard';

const WHEN = { upcoming: 'Upcoming', week: 'Next 7 days', month: 'Next 30 days', past: 'Past events', all: 'All dates' };

export default function Events() {
  useTitle('Browse events');
  const s = useStore();
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const participant = ['STUDENT', 'GUEST'].includes(user.role);
  const [view, setView] = usePersistentState('scems_events_view', 'grid');
  const [q, setQ] = useState(params.get('q') || '');
  const [cat, setCat] = useState(params.get('cat') || '');
  const [when, setWhen] = useState(params.get('when') || 'upcoming');
  const [onlyEligible, setOnlyEligible] = useState(participant && user.role === 'STUDENT');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [page, setPage] = useState(1);

  const list = useMemo(() => {
    const now = Date.now();
    const horizon = { week: 7, month: 30 }[when];
    return visibleEvents(s, user)
      .filter((e) => !q || `${e.title} ${e.description} ${byId(s.locations, e.venueId)?.name}`.toLowerCase().includes(q.toLowerCase()))
      .filter((e) => !cat || e.category === cat)
      .filter((e) => {
        if (when === 'past') return e.endsAt < now;
        if (when === 'all') return true;
        if (e.endsAt < now) return false;
        return !horizon || e.startsAt < now + horizon * 864e5;
      })
      .filter((e) => !onlyEligible || !participant || checkEligibility(user, e).eligible)
      .filter((e) => !onlyOpen || (registrationWindow(e).open && eventStats(s, e.id).remaining > 0))
      .sort((a, b) => (when === 'past' ? b.startsAt - a.startsAt : a.startsAt - b.startsAt));
  }, [s, user, q, cat, when, onlyEligible, onlyOpen, participant]);

  const { rows, pages, page: p } = paginate(list, page, 9);
  const update = (fn) => { fn(); setPage(1); };
  const clear = () => update(() => { setQ(''); setCat(''); setWhen('upcoming'); setOnlyEligible(false); setOnlyOpen(false); setParams({}); });

  return (
    <>
      <PageHeader
        title="Browse events"
        subtitle={user.role === 'GUEST' ? 'Showing events that welcome external participants.' : 'Find events, check whether you are eligible, and register in one step.'}
      />
      <Panel className="mb-3">
        <div className="filter-bar">
          <div className="search-box">
            <i className="bi bi-search" aria-hidden="true" />
            <Form.Control type="search" placeholder="Search by name, topic or venue" value={q} onChange={(e) => update(() => setQ(e.target.value))} aria-label="Search events" />
          </div>
          <Form.Select value={cat} onChange={(e) => update(() => setCat(e.target.value))} aria-label="Category">
            <option value="">All categories</option>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Form.Select>
          <Form.Select value={when} onChange={(e) => update(() => setWhen(e.target.value))} aria-label="Date range">
            {Object.entries(WHEN).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Form.Select>
          {participant && <Form.Check type="switch" id="f-elig" label="Only events I can join" checked={onlyEligible} onChange={(e) => update(() => setOnlyEligible(e.target.checked))} />}
          <Form.Check type="switch" id="f-open" label="Seats available" checked={onlyOpen} onChange={(e) => update(() => setOnlyOpen(e.target.checked))} />
          <ButtonGroup className="ms-auto" aria-label="Layout">
            <Button variant={view === 'grid' ? 'primary' : 'light'} onClick={() => setView('grid')} aria-pressed={view === 'grid'} aria-label="Grid view"><i className="bi bi-grid-3x3-gap" /></Button>
            <Button variant={view === 'list' ? 'primary' : 'light'} onClick={() => setView('list')} aria-pressed={view === 'list'} aria-label="List view"><i className="bi bi-list-ul" /></Button>
          </ButtonGroup>
        </div>
      </Panel>

      <div className="d-flex justify-content-between align-items-center mb-2">
        <span className="small text-muted-2" aria-live="polite">{list.length} event{list.length === 1 ? '' : 's'} found</span>
      </div>

      {!list.length ? (
        <Panel>
          <EmptyState icon="calendar-x" title="No events match these filters" action={<Button variant="outline-primary" onClick={clear}>Clear filters</Button>}>
            Try a different category or date range.
          </EmptyState>
        </Panel>
      ) : view === 'grid' ? (
        <Row className="g-3">
          {rows.map((e) => <Col sm={6} lg={4} key={e.id}><EventCard event={e} user={user} /></Col>)}
        </Row>
      ) : (
        <Panel flush>
          <Table hover responsive className="mb-0 align-middle table-stack">
            <thead><tr><th>Event</th><th>Date</th><th>Venue</th><th>Seats</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((e) => {
                const st = eventStats(s, e.id);
                const reg = myRegistration(s, e.id, user.id);
                const elig = participant ? checkEligibility(user, e) : null;
                return (
                  <tr key={e.id}>
                    <td className="td-main">
                      <Link to={`/events/${e.id}`} className="fw-600 text-decoration-none">{e.title}</Link>
                      <div className="small-2 text-muted-2">{CATEGORIES[e.category].label}{eventPhase(e) === 'LIVE' && <span className="text-danger fw-600"> · Live now</span>}</div>
                    </td>
                    <td data-label="Date">{fmtDateShort(e.startsAt)}, {fmtTime(e.startsAt)}</td>
                    <td data-label="Venue">{byId(s.locations, e.venueId)?.name}</td>
                    <td data-label="Seats">{st.remaining > 0 ? `${st.remaining} left` : <span className="text-danger">Full</span>}</td>
                    <td data-label="Status">
                      {e.status !== 'PUBLISHED' ? <StatusBadge kind="event" status={e.status} />
                        : reg && reg.status !== 'CANCELLED' ? <StatusBadge kind="reg" status={reg.status} />
                          : elig ? (elig.eligible ? <Tag tone="success" icon="check2">Eligible</Tag> : <Tag icon="slash-circle">Not eligible</Tag>) : <StatusBadge kind="event" status={e.status} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Panel>
      )}
      <div className="mt-3"><Pager page={p} pages={pages} onChange={setPage} /></div>
    </>
  );
}
