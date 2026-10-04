import { useRef, useState } from 'react';
import { Button, Col, Form, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { ROLES } from '../../data/constants';
import { useStore } from '../../store/store';
import { useCurrentUser } from '../../store/session';
import { deptName } from '../../store/selectors';
import { setPhoto, updateProfile } from '../../store/actions';
import { fmtDate, fmtDateTime } from '../../utils/format';
import { resizeImage } from '../../utils/files';
import { useTitle } from '../../utils/hooks';
import { Avatar, PageHeader, Panel, RoleBadge, StatusBadge } from '../../components/ui';
import { confirmDialog, toast } from '../../components/feedback';

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
  const user = useCurrentUser();
  const s = useStore();
  const fileRef = useRef(null);
  const [phone, setPhone] = useState(user.phone || '');
  const [prefs, setPrefs] = useState(user.prefs || { email: true, reminders: true });
  const [uploading, setUploading] = useState(false);
  const dirty = phone !== (user.phone || '') || JSON.stringify(prefs) !== JSON.stringify(user.prefs || {});

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return toast.error('Please choose a JPG, PNG or WebP image.');
    if (file.size > 2 * 1024 * 1024) return toast.error('The image must be 2 MB or smaller.');
    setUploading(true);
    try {
      toast.result(setPhoto(await resizeImage(file)));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };
  const removePhoto = async () => {
    if (await confirmDialog({ title: 'Remove your photo?', message: 'Security staff use your photo to confirm your identity at the gate.', confirmText: 'Remove', variant: 'danger' })) toast.result(setPhoto(null));
  };

  return (
    <>
      <PageHeader title="My profile" subtitle="Academic details are managed by the college office. You can update your photo, phone and notification settings." />
      <Row className="g-3">
        <Col lg={4}>
          <Panel title="Photo" icon="person-bounding-box">
            <div className="text-center">
              <Avatar user={user} size={132} className="mb-3" />
              <p className="small text-muted-2">Shown on your pass and to security staff at the gate. Use a clear, front-facing photo.</p>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="d-none" onChange={onFile} aria-label="Upload photo" />
              <div className="d-flex gap-2 justify-content-center">
                <Button onClick={() => fileRef.current.click()} disabled={uploading}><i className="bi bi-upload me-1" />{uploading ? 'Uploading…' : user.photo ? 'Change photo' : 'Upload photo'}</Button>
                {user.photo && <Button variant="outline-danger" onClick={removePhoto}>Remove</Button>}
              </div>
              <div className="small-2 text-muted-2 mt-2">JPG, PNG or WebP · up to 2 MB · cropped to a square</div>
            </div>
          </Panel>
        </Col>
        <Col lg={8} className="section-gap">
          <Panel title="Account" icon="person-vcard" actions={<RoleBadge role={user.role} />}>
            <Row className="g-3">
              <ReadOnly label="Full name" value={user.name} />
              <ReadOnly label="Email" value={user.email} />
              {user.role === 'STUDENT' && (
                <>
                  <ReadOnly label="URN" value={user.urn} mono />
                  <ReadOnly label="Department" value={deptName(s, user.dept)} />
                  <ReadOnly label="Semester / Section" value={`Sem ${user.semester} · Sec ${user.section}`} />
                  <ReadOnly label="Batch" value={user.batch} />
                  <ReadOnly label="Date of birth" value={user.dob && fmtDate(new Date(user.dob).getTime(), { weekday: undefined })} />
                  <Col sm={6} md={4}><div className="small-2 text-muted-2 fw-600 text-uppercase">Enrollment</div><StatusBadge kind="user" status={user.enrolled ? 'ACTIVE' : 'INACTIVE'} label={user.enrolled ? 'Enrolled' : 'Not enrolled'} /></Col>
                </>
              )}
              {user.role === 'GUEST' && <ReadOnly label="Organization" value={user.organization} />}
              {['ORGANIZER', 'SECURITY', 'ADMIN'].includes(user.role) && <ReadOnly label="Unit" value={user.unit} />}
              <ReadOnly label="Role" value={ROLES[user.role].label} />
              <ReadOnly label="Last sign-in" value={user.lastLoginAt && fmtDateTime(user.lastLoginAt)} />
            </Row>
            {user.role === 'STUDENT' && <p className="small text-muted-2 mt-3 mb-0"><i className="bi bi-info-circle me-1" />Details wrong? Contact the Student Welfare office — they are synced from college records.</p>}
          </Panel>

          <Panel title="Contact & notifications" icon="bell">
            <Form onSubmit={(e) => { e.preventDefault(); toast.result(updateProfile({ phone, prefs })); }}>
              <Row className="g-3">
                <Col md={6}>
                  <Form.Group controlId="pf-phone"><Form.Label>Mobile number</Form.Label>
                    <Form.Control type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
                  </Form.Group>
                </Col>
                <Col md={6} className="d-flex flex-column justify-content-end gap-2">
                  <Form.Check type="switch" id="pf-email" label="Email me about registration updates" checked={prefs.email} onChange={(e) => setPrefs((p) => ({ ...p, email: e.target.checked }))} />
                  <Form.Check type="switch" id="pf-rem" label="Remind me 24 hours before an event" checked={prefs.reminders} onChange={(e) => setPrefs((p) => ({ ...p, reminders: e.target.checked }))} />
                </Col>
              </Row>
              <div className="d-flex gap-2 mt-3">
                <Button type="submit" disabled={!dirty}>Save changes</Button>
                <Button variant="outline-primary" as={Link} to="/change-password"><i className="bi bi-key me-1" />Change password</Button>
              </div>
            </Form>
          </Panel>
        </Col>
      </Row>
    </>
  );
}
