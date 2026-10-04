import { useRef, useState } from 'react';
import { Button, Col, Form, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ROLES } from '../../data/constants';
import { useAuth } from '../../auth/AuthContext';
import { fmtDate, fmtDateTime } from '../../utils/format';
import { resizeImage } from '../../utils/files';
import { useTitle } from '../../utils/hooks';
import { Avatar, PageHeader, Panel, RoleBadge, StatusBadge } from '../../components/ui';
import { attempt, confirmDialog } from '../../components/feedback';

function ReadOnly({ label, value, mono }) {
  return (
    <Col sm={6} md={4}>
      <div className="small-2 text-muted-2 fw-600 text-uppercase">{label}</div>
      <div className={mono ? 'mono fw-600' : 'fw-600'}>{value || '—'}</div>
    </Col>
  );
}

export default function Profile() {
  useTitle('My profile');
  const { user, setUser } = useAuth();
  const fileRef = useRef(null);
  const [phone, setPhone] = useState(user.phone || '');
  const [uploading, setUploading] = useState(false);
  const s = user.student;

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      await attempt(() => Promise.reject(new Error('Please choose a JPG, PNG or WebP image.')));
      return;
    }
    setUploading(true);
    const form = new FormData();
    try {
      form.append('file', await resizeImage(file), 'photo.jpg');
      const me = await attempt(() => api('/me/photo', { method: 'POST', form }), 'Photo updated.');
      if (me) setUser(me);
    } finally {
      setUploading(false);
    }
  };
  const removePhoto = async () => {
    if (!(await confirmDialog({ title: 'Remove your photo?', message: 'Security staff use your photo to confirm your identity at the gate.', confirmText: 'Remove', variant: 'danger' }))) return;
    const me = await attempt(() => api('/me/photo', { method: 'DELETE' }), 'Photo removed.');
    if (me) setUser(me);
  };
  const savePhone = async (e) => {
    e.preventDefault();
    const me = await attempt(() => api('/me', { method: 'PUT', body: { phone } }), 'Profile saved.');
    if (me) setUser(me);
  };

  return (
    <>
      <PageHeader title="My profile" subtitle="Academic details come from college records. You can update your photo, phone number and password." />
      <Row className="g-3">
        <Col lg={4}>
          <Panel title="Photo" icon="person-bounding-box">
            <div className="text-center">
              <Avatar user={user} size={132} className="mb-3" />
              <p className="small text-muted-2">Shown on your pass and to security staff at the gate. Use a clear, front-facing photo.</p>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="d-none" onChange={onFile} aria-label="Upload photo" />
              <div className="d-flex gap-2 justify-content-center">
                <Button onClick={() => fileRef.current.click()} disabled={uploading}><i className="bi bi-upload me-1" />{uploading ? 'Uploading…' : user.photoUrl ? 'Change photo' : 'Upload photo'}</Button>
                {user.photoUrl && <Button variant="outline-danger" onClick={removePhoto}>Remove</Button>}
              </div>
              <div className="small-2 text-muted-2 mt-2">JPG, PNG or WebP · cropped to a square</div>
            </div>
          </Panel>
        </Col>
        <Col lg={8} className="section-gap">
          <Panel title="Account" icon="person-vcard" actions={<RoleBadge role={user.role} />}>
            <Row className="g-3">
              <ReadOnly label="Full name" value={user.name} />
              <ReadOnly label="Email" value={user.email} />
              {s && (
                <>
                  <ReadOnly label="URN" value={s.urn} mono />
                  <ReadOnly label="Department" value={s.deptName} />
                  <ReadOnly label="Semester / Section" value={`Sem ${s.semester} · Sec ${s.section}`} />
                  <ReadOnly label="Batch" value={s.batch} />
                  <ReadOnly label="Date of birth" value={s.dob && fmtDate(new Date(s.dob).getTime(), { weekday: undefined })} />
                  <Col sm={6} md={4}><div className="small-2 text-muted-2 fw-600 text-uppercase">Enrollment</div><StatusBadge kind="user" status={s.enrolled ? 'ACTIVE' : 'INACTIVE'} label={s.enrolled ? 'Enrolled' : 'Not enrolled'} /></Col>
                </>
              )}
              {!s && <ReadOnly label="Unit" value={user.unit} />}
              <ReadOnly label="Role" value={ROLES[user.role].label} />
              <ReadOnly label="Last sign-in" value={user.lastLoginAt && fmtDateTime(user.lastLoginAt)} />
            </Row>
            {s && <p className="small text-muted-2 mt-3 mb-0"><i className="bi bi-info-circle me-1" />Details wrong? Contact the Student Welfare office.</p>}
          </Panel>
          <Panel title="Contact" icon="telephone">
            <Form onSubmit={savePhone} className="d-flex flex-wrap gap-2 align-items-end">
              <Form.Group controlId="pf-phone" style={{ minWidth: 240 }}>
                <Form.Label>Mobile number</Form.Label>
                <Form.Control type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" maxLength={30} />
              </Form.Group>
              <Button type="submit" disabled={phone === (user.phone || '')}>Save</Button>
              <Button variant="outline-primary" as={Link} to="/change-password" className="ms-auto"><i className="bi bi-key me-1" />Change password</Button>
            </Form>
          </Panel>
        </Col>
      </Row>
    </>
  );
}
