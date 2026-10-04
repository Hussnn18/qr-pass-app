import { useMemo, useState } from 'react';
import { Button, Col, Form, Row } from 'react-bootstrap';
import { Link, useSearchParams } from 'react-router-dom';
import { LOCATION_TYPES } from '../../data/constants';
import { useStore } from '../../store/store';
import { useCurrentUser } from '../../store/session';
import { gatesForLocation, visibleEvents } from '../../store/selectors';
import { fmtDateShort, fmtTime } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { PageHeader, Panel } from '../../components/ui';
import CampusMap from '../../components/CampusMap';

export default function CampusMapPage() {
  useTitle('Campus map');
  const s = useStore();
  const user = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [types, setTypes] = useState([]);
  const selectedId = params.get('loc');
  const now = Date.now();
  const events = visibleEvents(s, user).filter((e) => e.endsAt > now && ['PUBLISHED', 'CLOSED'].includes(e.status));

  const list = useMemo(
    () => s.locations
      .filter((l) => !types.length || types.includes(l.type))
      .filter((l) => !q || `${l.name} ${l.building} ${l.description}`.toLowerCase().includes(q.toLowerCase())),
    [s.locations, types, q],
  );
  const toggleType = (t) => setTypes((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]));
  const select = (id) => setParams(id ? { loc: id } : {});
  const upcomingAt = (locId) => events.filter((e) => e.venueId === locId).sort((a, b) => a.startsAt - b.startsAt);

  const popup = (l) => {
    const evs = upcomingAt(l.id);
    const gates = gatesForLocation(s, l.id);
    return (
      <div>
        <div className="fw-bold" style={{ color: 'var(--gn-navy)' }}>{l.name}</div>
        <div className="small-2 text-muted-2 mb-1">{LOCATION_TYPES[l.type]?.label} · {l.building}{l.floor && l.floor !== '—' ? ` · Floor ${l.floor}` : ''}</div>
        <div className="small mb-2">{l.description}</div>
        {gates.length > 0 && <div className="small-2 mb-2"><i className="bi bi-door-open me-1" />Entry: {gates.map((g) => g.name).join(', ')}</div>}
        {evs.length > 0 && (
          <div className="mb-2">
            <div className="small-2 fw-bold text-uppercase text-muted-2">Upcoming here</div>
            {evs.slice(0, 3).map((e) => (
              <div key={e.id} className="small"><Link to={`/events/${e.id}`}>{e.title}</Link> <span className="text-muted-2">· {fmtDateShort(e.startsAt)} {fmtTime(e.startsAt)}</span></div>
            ))}
          </div>
        )}
        <a className="btn btn-primary btn-sm" href={`https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`} target="_blank" rel="noreferrer">
          <i className="bi bi-signpost-split me-1" />Directions
        </a>
      </div>
    );
  };

  return (
    <>
      <PageHeader title="Campus map" subtitle="Find event venues, labs, halls and facilities. Select a place to see what's happening there." />
      <Row className="g-3">
        <Col lg={4}>
          <Panel flush>
            <div className="p-3 border-bottom">
              <div className="search-box mb-2">
                <i className="bi bi-search" aria-hidden="true" />
                <Form.Control type="search" placeholder="Search places" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search campus places" />
              </div>
              <div className="d-flex flex-wrap gap-1" role="group" aria-label="Filter by type">
                {Object.entries(LOCATION_TYPES).filter(([k]) => s.locations.some((l) => l.type === k)).map(([k, v]) => (
                  <button key={k} type="button" className="toggle-chip small-2" aria-pressed={types.includes(k)} onClick={() => toggleType(k)}>
                    <i className={`bi bi-${v.icon} me-1`} aria-hidden="true" />{v.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="loc-list" role="list">
              {list.map((l) => {
                const n = upcomingAt(l.id).length;
                return (
                  <button key={l.id} type="button" role="listitem" className={`loc-item ${l.id === selectedId ? 'active' : ''}`} onClick={() => select(l.id)} aria-current={l.id === selectedId ? 'true' : undefined}>
                    <span className="loc-dot" style={{ '--c': LOCATION_TYPES[l.type]?.color }}><i className={`bi bi-${LOCATION_TYPES[l.type]?.icon}`} aria-hidden="true" /></span>
                    <span className="min-w-0 flex-grow-1">
                      <span className="d-block fw-600 small text-truncate">{l.name}</span>
                      <span className="d-block small-2 text-muted-2">{LOCATION_TYPES[l.type]?.label}</span>
                    </span>
                    {n > 0 && <span className="badge-soft tone-brand">{n} event{n > 1 ? 's' : ''}</span>}
                  </button>
                );
              })}
              {!list.length && <div className="p-4 text-center small text-muted-2">No places match.</div>}
            </div>
          </Panel>
        </Col>
        <Col lg={8}>
          <CampusMap locations={list} selectedId={selectedId} onSelect={select} renderPopup={popup} height="min(68vh, 640px)" />
          <div className="d-flex justify-content-between flex-wrap gap-2 mt-2 small-2 text-muted-2">
            <span><i className="bi bi-info-circle me-1" />Building positions come from OpenStreetMap. Admins can adjust them in Locations &amp; Gates.</span>
            {selectedId && <Button size="sm" variant="link" className="p-0" onClick={() => select(null)}>Clear selection</Button>}
          </div>
        </Col>
      </Row>
    </>
  );
}
