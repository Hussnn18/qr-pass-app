import { useMemo, useState } from 'react';
import { Button, Col, Form, Row } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../../api/useApi';
import { useAuth } from '../../auth/AuthContext';
import { VENUE_TYPES } from '../../data/constants';
import { fmtDateShort, fmtTime } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { Async, PageHeader, Panel } from '../../components/ui';
import CampusMap, { directionsUrl, hasPosition } from '../../components/CampusMap';

/** Interactive campus map (objective 4): find a venue, see what's on there, get walking directions. */
export default function CampusMapPage() {
  useTitle('Campus map');
  const { user } = useAuth();
  const res = useApi('/campus/places');
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [types, setTypes] = useState([]);
  const [eventsOnly, setEventsOnly] = useState(false);
  const selectedId = params.get('place') ? Number(params.get('place')) : null;
  const places = res.data || [];

  const list = useMemo(() => places
    .filter((p) => !types.length || types.includes(p.type))
    .filter((p) => !eventsOnly || p.events.length)
    .filter((p) => !q || `${p.name} ${p.building || ''} ${p.description || ''} ${p.events.map((e) => e.title).join(' ')}`.toLowerCase().includes(q.toLowerCase())),
  [places, types, eventsOnly, q]);
  const toggleType = (t) => setTypes((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]));
  const select = (id) => setParams(id ? { place: id } : {}, { replace: true });
  const unplaced = places.filter((p) => !hasPosition(p)).length;

  const popup = (p) => (
    <div>
      <div className="fw-bold" style={{ color: 'var(--gn-navy)' }}>{p.name}</div>
      <div className="small-2 text-muted-2 mb-1">{VENUE_TYPES[p.type]?.label}{p.building ? ` · ${p.building}` : ''}{p.floor && p.floor !== '—' ? ` · Floor ${p.floor}` : ''}</div>
      {p.description && <div className="small mb-2">{p.description}</div>}
      {p.gates.length > 0 && <div className="small-2 mb-2"><i className="bi bi-door-open me-1" />Entry: {p.gates.join(', ')}</div>}
      {p.events.length > 0 && (
        <div className="mb-2">
          <div className="small-2 fw-bold text-uppercase text-muted-2">Upcoming here</div>
          {p.events.map((e) => (
            <div key={e.id} className="small">
              {e.live && <span className="live-chip me-1">● Gates open</span>}
              <Link to={`/events/${e.id}`}>{e.title}</Link> <span className="text-muted-2">· {fmtDateShort(e.startsAt)} {fmtTime(e.startsAt)}</span>
            </div>
          ))}
        </div>
      )}
      <a className="btn btn-primary btn-sm" href={directionsUrl(p)} target="_blank" rel="noreferrer">
        <i className="bi bi-signpost-split me-1" />Directions
      </a>
    </div>
  );

  return (
    <>
      <PageHeader title="Campus map" subtitle="Find event venues, labs, halls and facilities. Select a place to see what's on there and get walking directions." />
      <Async state={res}>
        {() => (
          <Row className="g-3">
            <Col lg={4} className="order-2 order-lg-1">
              <Panel flush>
                <div className="p-3 border-bottom">
                  <div className="search-box mb-2">
                    <i className="bi bi-search" aria-hidden="true" />
                    <Form.Control type="search" placeholder="Search places or events" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search places or events" />
                  </div>
                  <div className="d-flex flex-wrap gap-1 mb-2" role="group" aria-label="Filter by type">
                    {Object.entries(VENUE_TYPES).filter(([k]) => places.some((p) => p.type === k)).map(([k, v]) => (
                      <button key={k} type="button" className="toggle-chip small-2" aria-pressed={types.includes(k)} onClick={() => toggleType(k)}>
                        <i className={`bi bi-${v.icon} me-1`} aria-hidden="true" />{v.label}
                      </button>
                    ))}
                  </div>
                  <Form.Check type="switch" id="events-only" label="Only places with upcoming events" checked={eventsOnly} onChange={(e) => setEventsOnly(e.target.checked)} className="small" />
                </div>
                <div className="loc-list" role="list" aria-label="Places">
                  {list.map((p) => (
                    <button key={p.id} type="button" role="listitem" className={`loc-item ${p.id === selectedId ? 'active' : ''}`} onClick={() => select(p.id)}
                      aria-current={p.id === selectedId ? 'true' : undefined}>
                      <span className="loc-dot" style={{ '--c': VENUE_TYPES[p.type]?.color }}><i className={`bi bi-${VENUE_TYPES[p.type]?.icon}`} aria-hidden="true" /></span>
                      <span className="min-w-0 flex-grow-1">
                        <span className="d-block fw-600 small text-truncate">{p.name}</span>
                        <span className="d-block small-2 text-muted-2">{VENUE_TYPES[p.type]?.label}{!hasPosition(p) && ' · not on the map yet'}</span>
                      </span>
                      {p.events.some((e) => e.live) ? <span className="live-chip">● Live</span>
                        : p.events.length > 0 && <span className="badge-soft tone-brand">{p.events.length} event{p.events.length > 1 ? 's' : ''}</span>}
                    </button>
                  ))}
                  {!list.length && <div className="p-4 text-center small text-muted-2">{places.length ? 'No places match.' : 'No campus places have been added yet.'}</div>}
                </div>
              </Panel>
            </Col>
            <Col lg={8} className="order-1 order-lg-2">
              <CampusMap places={list} selectedId={selectedId} onSelect={select} renderPopup={popup} height="min(68vh, 640px)" />
              <div className="d-flex justify-content-between flex-wrap gap-2 mt-2 small-2 text-muted-2">
                <span>
                  <i className="bi bi-info-circle me-1" />Map data © OpenStreetMap contributors.
                  {unplaced > 0 && ` ${unplaced} place${unplaced > 1 ? 's have' : ' has'} no map position yet.`}
                  {user.role === 'ADMIN' && <> <Link to="/admin/venues">Manage venues</Link></>}
                </span>
                {selectedId && <Button size="sm" variant="link" className="p-0" onClick={() => select(null)}>Clear selection</Button>}
              </div>
            </Col>
          </Row>
        )}
      </Async>
    </>
  );
}
