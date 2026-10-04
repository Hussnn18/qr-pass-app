import { useState } from 'react';
import { Alert, Button, Col, Form, Nav, Row, Spinner } from 'react-bootstrap';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { DEMO_ACCOUNTS } from '../../data/constants';
import { useAuth } from '../../auth/AuthContext';
import { useTitle } from '../../utils/hooks';
import { Avatar, Panel, RoleBadge } from '../../components/ui';
import { PasswordInput } from './PasswordField';

const TABS = {
  student: { label: 'Student', icon: 'mortarboard', field: 'University Roll No. (URN)', placeholder: 'e.g. 2302511', mode: 'numeric' },
  staff: { label: 'Faculty / Staff', icon: 'briefcase', field: 'College email', placeholder: 'name@gndec.ac.in', mode: 'email' },
};

export default function Login() {
  useTitle('Sign in');
  const { ready, user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState('student');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [validated, setValidated] = useState(false);

  if (ready && user) return <Navigate to="/" replace />;
  const t = TABS[tab];

  const signIn = async (id, pw) => {
    setError('');
    setBusy(true);
    try {
      const u = await login(id, pw);
      const dest = location.state?.from || '/';
      navigate(u.mustChangePassword ? '/change-password' : dest, { replace: true, state: u.mustChangePassword ? { next: dest } : undefined });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    setValidated(true);
    if (identifier.trim() && password) signIn(identifier.trim(), password);
  };

  return (
    <Row className="g-4">
      <Col lg={5}>
        <Panel title="Sign in to Smart Campus Events" icon="box-arrow-in-right" className="auth-panel">
          <Nav variant="tabs" activeKey={tab} onSelect={(k) => { setTab(k); setError(''); setValidated(false); }} className="mb-3">
            {Object.entries(TABS).map(([k, v]) => (
              <Nav.Item key={k}>
                <Nav.Link eventKey={k}><i className={`bi bi-${v.icon} me-1`} aria-hidden="true" />{v.label}</Nav.Link>
              </Nav.Item>
            ))}
          </Nav>
          {error && <Alert variant="danger" className="py-2 small" role="alert"><i className="bi bi-exclamation-octagon me-2" />{error}</Alert>}
          <Form noValidate validated={validated} onSubmit={submit}>
            <Form.Group className="mb-3" controlId="login-id">
              <Form.Label>{t.field}</Form.Label>
              <Form.Control value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={t.placeholder}
                inputMode={t.mode} autoComplete="username" required autoFocus />
              <Form.Control.Feedback type="invalid">Enter your {t.field.toLowerCase()}.</Form.Control.Feedback>
            </Form.Group>
            <Form.Group className="mb-3" controlId="login-pw">
              <Form.Label>Password</Form.Label>
              <PasswordInput value={password} onChange={setPassword} isInvalid={validated && !password} />
            </Form.Group>
            <Button type="submit" className="w-100" disabled={busy}>
              {busy ? <><Spinner size="sm" className="me-2" />Signing in…</> : 'Sign in'}
            </Button>
          </Form>
          <p className="small text-muted-2 mt-3 mb-0">
            Forgot your password? Ask the Student Welfare office to reset it — you'll get a temporary password to change at first sign-in.
            Five wrong attempts lock the account for 15 minutes.
          </p>
        </Panel>
      </Col>
      <Col lg={7}>
        {import.meta.env.DEV && (
          <Panel title="Demo accounts (development only)" icon="people">
            <p className="small text-muted-2">Seeded by the backend's dev profile. Password for all: <code>demo</code>.</p>
            <Row className="g-2">
              {DEMO_ACCOUNTS.map((a) => (
                <Col sm={6} key={a.email}>
                  <button type="button" className="demo-account" onClick={() => signIn(a.email, 'demo')} disabled={busy}>
                    <Avatar user={{ name: a.name }} size={38} />
                    <span className="min-w-0">
                      <span className="d-flex gap-2 align-items-center flex-wrap"><strong className="small">{a.name}</strong><RoleBadge role={a.role} /></span>
                      <span className="d-block small-2 text-muted-2">{a.blurb}</span>
                    </span>
                  </button>
                </Col>
              ))}
            </Row>
          </Panel>
        )}
        <Panel title="What this system does" icon="info-circle">
          <Row className="g-3 small">
            {[
              ['calendar-check', 'Event management', 'Scheduling, venues, capacity and eligibility rules for every college event.'],
              ['person-check', 'Secure registration', 'Role-based sign-in. The server checks eligibility before any seat is given.'],
              ['qr-code', 'Digital passes', 'Each pass is a one-time QR token. Copies and screenshots of used passes are refused.'],
              ['upc-scan', 'Gate verification', 'Security staff scan at their assigned gates; every entry and attempt is recorded.'],
            ].map(([icon, title, text]) => (
              <Col sm={6} key={title} className="d-flex gap-2">
                <i className={`bi bi-${icon} fs-5`} style={{ color: 'var(--gn-maroon)' }} aria-hidden="true" />
                <div><div className="fw-600">{title}</div><div className="text-muted-2">{text}</div></div>
              </Col>
            ))}
          </Row>
        </Panel>
      </Col>
    </Row>
  );
}
