import { useState } from 'react';
import { Button, Form, Table } from 'react-bootstrap';
import { api } from '../../api/client';
import { useApi } from '../../api/useApi';
import { useTitle } from '../../utils/hooks';
import { ErrorState, Loading, PageHeader, Panel } from '../../components/ui';
import { attempt, confirmDialog } from '../../components/feedback';

/** Departments master data (O1-01). */
export default function Departments() {
  useTitle('Departments');
  const res = useApi('/admin/departments');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');

  const add = async (e) => {
    e.preventDefault();
    if (await attempt(() => api('/admin/departments', { method: 'POST', body: { code: code.trim().toUpperCase(), name: name.trim() } }), 'Department added.')) {
      setCode('');
      setName('');
      res.reload();
    }
  };
  const rename = async (e, d) => {
    e.preventDefault();
    if (await attempt(() => api(`/admin/departments/${d.code}`, { method: 'PUT', body: { code: d.code, name: editName.trim() } }), 'Department renamed.')) {
      setEditing(null);
      res.reload();
    }
  };
  const remove = async (d) => {
    if (!(await confirmDialog({ title: `Delete ${d.code}?`, message: d.name, confirmText: 'Delete', variant: 'danger' }))) return;
    if ((await attempt(() => api(`/admin/departments/${d.code}`, { method: 'DELETE' }), 'Department deleted.')) !== undefined) res.reload();
  };

  return (
    <>
      <PageHeader title="Departments" crumbs={[{ label: 'Control panel' }]} subtitle="Used for student records and event eligibility rules." />
      <Panel title="Add department" icon="plus-square" className="mb-3">
        <Form onSubmit={add} className="d-flex flex-wrap gap-2 align-items-end">
          <Form.Group controlId="d-code"><Form.Label>Code</Form.Label><Form.Control value={code} onChange={(e) => setCode(e.target.value)} maxLength={10} placeholder="e.g. AIML" style={{ width: 120 }} className="text-uppercase" /></Form.Group>
          <Form.Group controlId="d-name" className="flex-grow-1"><Form.Label>Name</Form.Label><Form.Control value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Artificial Intelligence & Machine Learning" /></Form.Group>
          <Button type="submit" disabled={code.trim().length < 2 || name.trim().length < 3}>Add</Button>
        </Form>
      </Panel>
      <Panel flush>
        {res.error && !res.data ? <ErrorState error={res.error} onRetry={res.reload} /> : !res.data ? <Loading /> : (
          <Table hover responsive className="mb-0 align-middle table-stack">
            <thead><tr><th>Code</th><th>Name</th><th>Students</th><th>Events restricted to it</th><th className="text-end">Actions</th></tr></thead>
            <tbody>
              {res.data.map((d) => (
                <tr key={d.code}>
                  <td className="td-main mono fw-600">{d.code}</td>
                  <td data-label="Name">
                    {editing === d.code ? (
                      <Form onSubmit={(e) => rename(e, d)} className="d-flex gap-2">
                        <Form.Control size="sm" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus aria-label={`New name for ${d.code}`} />
                        <Button size="sm" type="submit">Save</Button><Button size="sm" variant="light" onClick={() => setEditing(null)}>Cancel</Button>
                      </Form>
                    ) : d.name}
                  </td>
                  <td data-label="Students">{d.students}</td>
                  <td data-label="Events">{d.events}</td>
                  <td data-label="Actions" className="text-end">
                    <div className="d-flex gap-1 justify-content-end">
                      <Button size="sm" variant="light" onClick={() => { setEditing(d.code); setEditName(d.name); }} aria-label={`Rename ${d.code}`}><i className="bi bi-pencil" /></Button>
                      <Button size="sm" variant="outline-danger" onClick={() => remove(d)} disabled={d.students > 0 || d.events > 0} title={d.students || d.events ? 'Still in use' : 'Delete'} aria-label={`Delete ${d.code}`}><i className="bi bi-trash" /></Button>
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
