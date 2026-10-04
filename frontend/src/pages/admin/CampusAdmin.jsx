import { useState } from 'react';
import { Alert, Button, Col, Form, InputGroup, Row } from 'react-bootstrap';
import { LOCATION_TYPES } from '../../data/constants';
import { useStore } from '../../store/store';
import { byId, gatesForLocation } from '../../store/selectors';
import { addGate, deleteGate, deleteLocation, saveLocation } from '../../store/actions';
import { uid } from '../../utils/ids';
import { useTitle } from '../../utils/hooks';
import { PageHeader, Panel, Tag } from '../../components/ui';
import { confirmDialog, toast } from '../../components/feedback';
import CampusMap from '../../components/CampusMap';

const blank = (lat, lng) => ({ id: null, name: '', type: 'ACADEMIC', building: '', floor: '', lat, lng, description: '', canHostEvents: true, capacity: '' });

export default function CampusAdmin() {
  useTitle('Locations & gates');
  const s = useStore();
  const [selectedId, setSelectedId] = useState(s.locations[0]?.id);
  const [form, setForm] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [gateName, setGateName] = useState('');
  const loc = byId(s.locations, selectedId);
  const gates = loc ? gatesForLocation(s, loc.id) : [];
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const startEdit = (l) => { setForm({ ...l, capacity: l.capacity ?? '' }); setPlacing(false); };
  const onMapClick = (ll) => {
    if (placing) {
      setForm(blank(ll.lat, ll.lng));
      setPlacing(false);
      setSelectedId(null);
    } else if (form) {
      setForm((f) => ({ ...f, lat: ll.lat, lng: ll.lng }));
    }
  };
  const save = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Give the location a name.');
    const data = { ...form, id: form.id || uid('l'), name: form.name.trim(), capacity: form.capacity === '' ? null : Number(form.capacity), lat: Number(form.lat), lng: Number(form.lng) };
    toast.result(saveLocation(data));
    setSelectedId(data.id);
    setForm(null);
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: `Delete ${loc.name}?`, message: 'Its gates are removed too. Events must not be using it.', confirmText: 'Delete', variant: 'danger' }))) return;
    const r = deleteLocation(loc.id);
    toast.result(r);
    if (r.ok) setSelectedId(s.locations.find((l) => l.id !== loc.id)?.id);
  };
  const draft = form && !form.id ? { ...form, id: '__draft' } : null;
  const shown = form?.id ? s.locations.map((l) => (l.id === form.id ? { ...l, lat: Number(form.lat), lng: Number(form.lng), type: form.type } : l)) : s.locations;

  return (
    <>
      <PageHeader title="Locations & gates" crumbs={[{ label: 'Campus' }]} subtitle="Places shown on the campus map, which venues can host events, and their entry gates." actions={
        <Button variant={placing ? 'warning' : 'brand'} onClick={() => { setPlacing((x) => !x); setForm(null); }} aria-pressed={placing}>
          <i className={`bi bi-${placing ? 'x-lg' : 'geo-alt'} me-1`} />{placing ? 'Cancel placing' : 'Add location'}
        </Button>
      } />
      {placing && <Alert variant="warning" className="py-2 small"><i className="bi bi-cursor me-2" />Click the map where the new location should go.</Alert>}
      <Row className="g-3">
        <Col lg={7}>
          <CampusMap
            locations={shown}
            selectedId={form?.id || selectedId}
            onSelect={(id) => { if (!placing) { setSelectedId(id); setForm(null); } }}
            onMapClick={onMapClick}
            draggableId={form?.id}
            draft={draft}
            onDragEnd={(id, ll) => setForm((f) => (f ? { ...f, lat: ll.lat, lng: ll.lng } : f))}
            height="min(70vh, 620px)"
          />
          <p className="small-2 text-muted-2 mt-2"><i className="bi bi-info-circle me-1" />While editing, drag the marker or click the map to move it.</p>
        </Col>
        <Col lg={5} className="section-gap">
          {form ? (
            <Panel title={form.id ? `Edit ${form.name}` : 'New location'} icon="pencil-square">
              <Form onSubmit={save}>
                <Row className="g-2">
                  <Col xs={12}><Form.Group controlId="l-name"><Form.Label>Name</Form.Label><Form.Control value={form.name} onChange={set('name')} autoFocus /></Form.Group></Col>
                  <Col sm={6}><Form.Group controlId="l-type"><Form.Label>Type</Form.Label><Form.Select value={form.type} onChange={set('type')}>{Object.entries(LOCATION_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Form.Select></Form.Group></Col>
                  <Col sm={6}><Form.Group controlId="l-cap"><Form.Label>Capacity</Form.Label><Form.Control type="number" min={0} value={form.capacity} onChange={set('capacity')} placeholder="optional" /></Form.Group></Col>
                  <Col sm={8}><Form.Group controlId="l-bld"><Form.Label>Building</Form.Label><Form.Control value={form.building} onChange={set('building')} /></Form.Group></Col>
                  <Col sm={4}><Form.Group controlId="l-floor"><Form.Label>Floor</Form.Label><Form.Control value={form.floor} onChange={set('floor')} /></Form.Group></Col>
                  <Col xs={12}><Form.Group controlId="l-desc"><Form.Label>Description</Form.Label><Form.Control as="textarea" rows={2} value={form.description} onChange={set('description')} /></Form.Group></Col>
                  <Col xs={6}><Form.Group controlId="l-lat"><Form.Label>Latitude</Form.Label><Form.Control value={Number(form.lat).toFixed(6)} onChange={set('lat')} className="mono" /></Form.Group></Col>
                  <Col xs={6}><Form.Group controlId="l-lng"><Form.Label>Longitude</Form.Label><Form.Control value={Number(form.lng).toFixed(6)} onChange={set('lng')} className="mono" /></Form.Group></Col>
                  <Col xs={12}><Form.Check type="switch" id="l-host" label="Can host events (appears in the event venue list)" checked={form.canHostEvents} onChange={set('canHostEvents')} /></Col>
                </Row>
                <div className="d-flex gap-2 mt-3"><Button type="submit">Save location</Button><Button variant="light" onClick={() => setForm(null)}>Cancel</Button></div>
              </Form>
            </Panel>
          ) : loc ? (
            <Panel title={loc.name} icon={LOCATION_TYPES[loc.type]?.icon} actions={
              <div className="d-flex gap-1">
                <Button size="sm" variant="light" onClick={() => startEdit(loc)}><i className="bi bi-pencil me-1" />Edit</Button>
                <Button size="sm" variant="outline-danger" onClick={remove} aria-label={`Delete ${loc.name}`}><i className="bi bi-trash" /></Button>
              </div>
            }>
              <div className="d-flex flex-wrap gap-1 mb-2">
                <Tag tone="primary">{LOCATION_TYPES[loc.type]?.label}</Tag>
                {loc.canHostEvents ? <Tag tone="success" icon="calendar-check">Event venue</Tag> : <Tag>Not a venue</Tag>}
                {loc.capacity && <Tag icon="people">≈{loc.capacity}</Tag>}
              </div>
              <p className="small mb-1">{loc.description}</p>
              <div className="small-2 text-muted-2 mono">{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}</div>
              <hr />
              <h3 className="h6 fw-bold">Entry gates</h3>
              {!gates.length && <p className="small text-muted-2">No gates yet. Events at this venue need at least one to scan passes.</p>}
              <ul className="list-unstyled mb-2">
                {gates.map((g) => (
                  <li key={g.id} className="d-flex justify-content-between align-items-center py-1 border-bottom">
                    <span className="small"><i className="bi bi-door-open me-2" />{g.name}</span>
                    <Button size="sm" variant="link" className="text-danger" onClick={() => toast.result(deleteGate(g.id))} aria-label={`Remove ${g.name}`}><i className="bi bi-x-lg" /></Button>
                  </li>
                ))}
              </ul>
              <Form onSubmit={(e) => { e.preventDefault(); if (gateName.trim()) { toast.result(addGate(loc.id, gateName.trim())); setGateName(''); } }}>
                <InputGroup size="sm">
                  <Form.Control value={gateName} onChange={(e) => setGateName(e.target.value)} placeholder="New gate, e.g. Gate C (Rear)" aria-label="New gate name" />
                  <Button type="submit" disabled={!gateName.trim()}>Add gate</Button>
                </InputGroup>
              </Form>
            </Panel>
          ) : (
            <Panel><p className="small text-muted-2 mb-0">Select a marker to see its details.</p></Panel>
          )}
          <Panel title={`All locations (${s.locations.length})`} icon="list-ul" flush>
            <div className="loc-list" style={{ maxHeight: 280 }}>
              {s.locations.map((l) => (
                <button key={l.id} type="button" className={`loc-item ${l.id === selectedId ? 'active' : ''}`} onClick={() => { setSelectedId(l.id); setForm(null); setPlacing(false); }}>
                  <span className="loc-dot" style={{ '--c': LOCATION_TYPES[l.type]?.color }}><i className={`bi bi-${LOCATION_TYPES[l.type]?.icon}`} aria-hidden="true" /></span>
                  <span className="flex-grow-1 small fw-600">{l.name}</span>
                  <span className="small-2 text-muted-2">{gatesForLocation(s, l.id).length} gates</span>
                </button>
              ))}
            </div>
          </Panel>
        </Col>
      </Row>
    </>
  );
}
