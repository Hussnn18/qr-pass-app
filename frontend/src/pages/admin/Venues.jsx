import { useState } from 'react';
import { Alert, Button, Col, Form, InputGroup, Modal, Row, Table } from 'react-bootstrap';
import { api } from '../../api/client';
import { useApi } from '../../api/useApi';
import { VENUE_TYPES } from '../../data/constants';
import { useTitle } from '../../utils/hooks';
import { ErrorState, Loading, PageHeader, Panel, Tag } from '../../components/ui';
import { attempt, confirmDialog } from '../../components/feedback';

function VenueModal({ venue, onHide, onSaved }) {
  const isNew = !venue.id;
  const [f, setF] = useState(() => ({
    name: venue.name || '', type: venue.type || 'ACADEMIC', building: venue.building || '', floor: venue.floor || '', description: venue.description || '',
    capacity: venue.capacity ?? '', canHostEvents: venue.canHostEvents ?? true, lat: venue.lat ?? '', lng: venue.lng ?? '',
  }));
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    const body = { ...f, capacity: f.capacity === '' ? null : Number(f.capacity), lat: f.lat === '' ? null : Number(f.lat), lng: f.lng === '' ? null : Number(f.lng) };
    try {
      await api(isNew ? '/admin/venues' : `/admin/venues/${venue.id}`, { method: isNew ? 'POST' : 'PUT', body });
      onSaved();
      onHide();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Modal show onHide={onHide} centered size="lg">
      <Form onSubmit={submit}>
        <Modal.Header closeButton><Modal.Title>{isNew ? 'Add venue' : `Edit ${venue.name}`}</Modal.Title></Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}
          <Row className="g-2">
            <Col md={8}><Form.Group controlId="v-name"><Form.Label>Name</Form.Label><Form.Control value={f.name} onChange={set('name')} required autoFocus /></Form.Group></Col>
            <Col md={4}><Form.Group controlId="v-type"><Form.Label>Type</Form.Label><Form.Select value={f.type} onChange={set('type')}>{Object.entries(VENUE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Form.Select></Form.Group></Col>
            <Col md={6}><Form.Group controlId="v-bld"><Form.Label>Building</Form.Label><Form.Control value={f.building} onChange={set('building')} /></Form.Group></Col>
            <Col md={3}><Form.Group controlId="v-floor"><Form.Label>Floor</Form.Label><Form.Control value={f.floor} onChange={set('floor')} /></Form.Group></Col>
            <Col md={3}><Form.Group controlId="v-cap"><Form.Label>Capacity</Form.Label><Form.Control type="number" min={1} value={f.capacity} onChange={set('capacity')} placeholder="optional" /></Form.Group></Col>
            <Col xs={12}><Form.Group controlId="v-desc"><Form.Label>Description</Form.Label><Form.Control as="textarea" rows={2} value={f.description} onChange={set('description')} maxLength={500} /></Form.Group></Col>
            <Col md={6}><Form.Group controlId="v-lat"><Form.Label>Latitude <span className="text-muted-2 fw-normal">(for the campus map, objective 4)</span></Form.Label><Form.Control value={f.lat} onChange={set('lat')} className="mono" placeholder="30.8598" /></Form.Group></Col>
            <Col md={6}><Form.Group controlId="v-lng"><Form.Label>Longitude</Form.Label><Form.Control value={f.lng} onChange={set('lng')} className="mono" placeholder="75.8607" /></Form.Group></Col>
            <Col xs={12}><Form.Check type="switch" id="v-host" label="Can host events (appears in the event venue list)" checked={f.canHostEvents} onChange={set('canHostEvents')} /></Col>
          </Row>
        </Modal.Body>
        <Modal.Footer><Button variant="light" onClick={onHide}>Cancel</Button><Button type="submit">Save venue</Button></Modal.Footer>
      </Form>
    </Modal>
  );
}

function GateEditor({ venue, onChange }) {
  const [name, setName] = useState('');
  const add = async (e) => {
    e.preventDefault();
    if (await attempt(() => api(`/admin/venues/${venue.id}/gates`, { method: 'POST', body: { name: name.trim() } }), 'Gate added.')) {
      setName('');
      onChange();
    }
  };
  const remove = async (g) => {
    if ((await attempt(() => api(`/admin/gates/${g.id}`, { method: 'DELETE' }), 'Gate removed.')) !== undefined) onChange();
  };
  return (
    <div>
      <div className="d-flex flex-wrap gap-1 mb-2">
        {venue.gates.map((g) => (
          <span key={g.id} className="badge-soft tone-primary">
            <i className="bi bi-door-open" aria-hidden="true" />{g.name}
            <button type="button" className="btn btn-link btn-sm p-0 ms-1 text-danger" onClick={() => remove(g)} aria-label={`Remove ${g.name}`}><i className="bi bi-x" /></button>
          </span>
        ))}
        {!venue.gates.length && <span className="small text-muted-2">No gates — events here can't be scanned yet.</span>}
      </div>
      <Form onSubmit={add}>
        <InputGroup size="sm" style={{ maxWidth: 320 }}>
          <Form.Control value={name} onChange={(e) => setName(e.target.value)} placeholder="New gate, e.g. Gate C (Rear)" aria-label={`New gate for ${venue.name}`} />
          <Button type="submit" disabled={!name.trim()}>Add gate</Button>
        </InputGroup>
      </Form>
    </div>
  );
}

/** Venues and entry gates (O1-02, O1-03). The interactive campus map comes with objective 4. */
export default function Venues() {
  useTitle('Venues & gates');
  const res = useApi('/admin/venues');
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(null);

  const toggleActive = async (v) => {
    if (await attempt(() => api(`/admin/venues/${v.id}/active`, { method: 'PATCH', body: { active: !v.active } }), v.active ? 'Venue deactivated.' : 'Venue activated.')) res.reload();
  };
  const remove = async (v) => {
    if (!(await confirmDialog({ title: `Delete ${v.name}?`, message: 'Only venues that no event has ever used can be deleted.', confirmText: 'Delete', variant: 'danger' }))) return;
    if ((await attempt(() => api(`/admin/venues/${v.id}`, { method: 'DELETE' }), 'Venue deleted.')) !== undefined) res.reload();
  };

  return (
    <>
      <PageHeader title="Venues & gates" crumbs={[{ label: 'Control panel' }]} subtitle="Places where events happen and the gates where passes are scanned."
        actions={<Button variant="brand" onClick={() => setEditing({})}><i className="bi bi-plus-lg me-1" />Add venue</Button>} />
      <Panel flush>
        {res.error && !res.data ? <ErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <Loading /> : (
          <Table hover responsive className="mb-0 align-middle table-stack">
            <thead><tr><th>Venue</th><th>Type</th><th>Capacity</th><th>Gates</th><th>Events</th><th>Status</th><th className="text-end">Actions</th></tr></thead>
            <tbody>
              {res.data.map((v) => (
                <tr key={v.id}>
                  <td className="td-main">
                    <div className="fw-600">{v.name}</div>
                    <div className="small-2 text-muted-2">{[v.building, v.floor && v.floor !== '—' ? `Floor ${v.floor}` : null].filter(Boolean).join(' · ')}</div>
                    {open === v.id && <div className="mt-2"><GateEditor venue={v} onChange={res.reload} /></div>}
                  </td>
                  <td data-label="Type"><i className={`bi bi-${VENUE_TYPES[v.type]?.icon} me-1`} aria-hidden="true" />{VENUE_TYPES[v.type]?.label}</td>
                  <td data-label="Capacity">{v.capacity ?? '—'}</td>
                  <td data-label="Gates"><Button size="sm" variant="link" className="p-0" onClick={() => setOpen(open === v.id ? null : v.id)} aria-expanded={open === v.id}>{v.gates.length} gate{v.gates.length === 1 ? '' : 's'} <i className={`bi bi-chevron-${open === v.id ? 'up' : 'down'}`} /></Button></td>
                  <td data-label="Events">{v.events}</td>
                  <td data-label="Status">
                    <div className="d-flex flex-wrap gap-1">
                      {v.active ? <Tag tone="success">Active</Tag> : <Tag>Inactive</Tag>}
                      {v.canHostEvents ? <Tag tone="primary" icon="calendar-check">Event venue</Tag> : null}
                    </div>
                  </td>
                  <td data-label="Actions" className="text-end">
                    <div className="d-flex gap-1 justify-content-end">
                      <Button size="sm" variant="light" onClick={() => setEditing(v)} aria-label={`Edit ${v.name}`}><i className="bi bi-pencil" /></Button>
                      <Button size="sm" variant="light" onClick={() => toggleActive(v)}>{v.active ? 'Deactivate' : 'Activate'}</Button>
                      <Button size="sm" variant="outline-danger" onClick={() => remove(v)} disabled={v.events > 0} title={v.events ? 'Used by events — deactivate instead' : 'Delete'} aria-label={`Delete ${v.name}`}><i className="bi bi-trash" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
      {editing && <VenueModal venue={editing} onHide={() => setEditing(null)} onSaved={res.reload} />}
    </>
  );
}
