import { useState } from 'react';
import { Button, Form, Table } from 'react-bootstrap';
import { useStore } from '../../store/store';
import { deleteDepartment, saveDepartment } from '../../store/actions';
import { useTitle } from '../../utils/hooks';
import { PageHeader, Panel } from '../../components/ui';
import { confirmDialog, toast } from '../../components/feedback';

export default function Departments() {
  useTitle('Departments');
  const s = useStore();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');

  const add = (e) => {
    e.preventDefault();
    const r = saveDepartment({ id: code.trim().toUpperCase(), name: name.trim() }, true);
    toast.result(r);
    if (r.ok) { setCode(''); setName(''); }
  };
  const remove = async (d) => {
    if (await confirmDialog({ title: `Delete ${d.id}?`, message: d.name, confirmText: 'Delete', variant: 'danger' })) toast.result(deleteDepartment(d.id));
  };

  return (
    <>
      <PageHeader title="Departments" crumbs={[{ label: 'Control panel' }]} subtitle="Used for student records, event eligibility rules and department-wise analytics." />
      <Panel title="Add department" icon="plus-square" className="mb-3">
        <Form onSubmit={add} className="d-flex flex-wrap gap-2 align-items-end">
          <Form.Group controlId="d-code"><Form.Label>Code</Form.Label><Form.Control value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} placeholder="e.g. AIML" style={{ width: 120 }} className="text-uppercase" /></Form.Group>
          <Form.Group controlId="d-name" className="flex-grow-1"><Form.Label>Name</Form.Label><Form.Control value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Artificial Intelligence & Machine Learning" /></Form.Group>
          <Button type="submit" disabled={code.trim().length < 2 || name.trim().length < 3}>Add</Button>
        </Form>
      </Panel>
      <Panel flush>
        <Table hover responsive className="mb-0 align-middle table-stack">
          <thead><tr><th>Code</th><th>Name</th><th>Students</th><th>Events restricted to it</th><th className="text-end">Actions</th></tr></thead>
          <tbody>
            {s.departments.map((d) => {
              const students = s.users.filter((u) => u.dept === d.id).length;
              const events = s.events.filter((e) => e.eligibility?.departments?.includes(d.id)).length;
              return (
                <tr key={d.id}>
                  <td className="td-main mono fw-600">{d.id}</td>
                  <td data-label="Name">
                    {editing === d.id ? (
                      <Form onSubmit={(e) => { e.preventDefault(); toast.result(saveDepartment({ id: d.id, name: editName.trim() }, false)); setEditing(null); }} className="d-flex gap-2">
                        <Form.Control size="sm" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus aria-label={`New name for ${d.id}`} />
                        <Button size="sm" type="submit">Save</Button><Button size="sm" variant="light" onClick={() => setEditing(null)}>Cancel</Button>
                      </Form>
                    ) : d.name}
                  </td>
                  <td data-label="Students">{students}</td>
                  <td data-label="Events">{events}</td>
                  <td data-label="Actions" className="text-end">
                    <div className="d-flex gap-1 justify-content-end">
                      <Button size="sm" variant="light" onClick={() => { setEditing(d.id); setEditName(d.name); }} aria-label={`Rename ${d.id}`}><i className="bi bi-pencil" /></Button>
                      <Button size="sm" variant="outline-danger" onClick={() => remove(d)} disabled={students > 0} title={students ? 'Move or remove its students first' : 'Delete'} aria-label={`Delete ${d.id}`}><i className="bi bi-trash" /></Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Panel>
    </>
  );
}
