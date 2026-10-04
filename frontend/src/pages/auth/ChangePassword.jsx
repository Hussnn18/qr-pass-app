import { useState } from 'react';
import { Alert, Button, Col, Form, Row } from 'react-bootstrap';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useTitle } from '../../utils/hooks';
import { PageHeader, Panel } from '../../components/ui';
import { toast } from '../../components/feedback';
import { PasswordInput, StrengthMeter, passwordOk } from './PasswordField';

export default function ChangePassword() {
  useTitle('Change password');
  const { user, applySession, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const forced = !!user?.mustChangePassword;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      applySession(await api('/me/password', { method: 'PUT', body: { currentPassword: forced ? null : current, newPassword: next } }));
      toast.success('Your password has been changed. Other devices were signed out.');
      navigate(location.state?.next || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!forced && <PageHeader title="Change password" crumbs={[{ label: 'My Profile', to: '/profile' }]} />}
      <Row className="justify-content-center">
        <Col md={8} lg={5}>
          {forced && (
            <Alert variant="warning" className="mt-2">
              <Alert.Heading className="h6 fw-bold"><i className="bi bi-shield-lock me-2" />Set a new password to continue</Alert.Heading>
              <p className="small mb-0">Hi {user.name.split(' ')[0]}, your account was created with a temporary password. Choose your own before using the portal.</p>
            </Alert>
          )}
          <Panel title={forced ? 'Create your password' : 'Update password'} icon="key">
            {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}
            <Form onSubmit={submit}>
              {!forced && (
                <Form.Group controlId="cp-current" className="mb-3">
                  <Form.Label>Current password</Form.Label>
                  <PasswordInput value={current} onChange={setCurrent} />
                </Form.Group>
              )}
              <Form.Group controlId="cp-new" className="mb-3">
                <Form.Label>New password</Form.Label>
                <PasswordInput value={next} onChange={setNext} autoComplete="new-password" autoFocus={forced} />
                <StrengthMeter value={next} />
              </Form.Group>
              <Form.Group controlId="cp-confirm" className="mb-3">
                <Form.Label>Confirm new password</Form.Label>
                <Form.Control type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" isInvalid={!!confirm && confirm !== next} />
                <Form.Control.Feedback type="invalid">Passwords don't match.</Form.Control.Feedback>
              </Form.Group>
              <Button type="submit" className="w-100" disabled={busy || !passwordOk(next) || next !== confirm || (!forced && !current)}>
                {busy ? 'Saving…' : 'Save password'}
              </Button>
              {forced && <Button variant="link" className="w-100 mt-2 small" onClick={async () => { await logout(); navigate('/login'); }}>Sign out instead</Button>}
            </Form>
          </Panel>
        </Col>
      </Row>
    </>
  );
}
