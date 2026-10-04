import { useState } from 'react';
import { Alert, Button, Col, Form, Nav, Row, Spinner } from 'react-bootstrap';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../data/constants';
import { useStore } from '../../store/store';
import { session, useCurrentUser } from '../../store/session';
import { login, quickLogin } from '../../store/actions';
import { byId } from '../../store/selectors';
import { useTitle } from '../../utils/hooks';
import { Avatar, Panel, RoleBadge } from '../../components/ui';
import { PasswordInput } from './PasswordField';

const TABS = {
  student: { label: 'Student', icon: 'mortarboard', field: 'University Roll No. (URN)', placeholder: 'e.g. 2302511', mode: 'numeric', example: 'u_stu1' },
  staff: { label: 'Faculty / Staff', icon: 'briefcase', field: 'College email', placeholder: 'name@gndec.demo', mode: 'email', example: 'u_org1' },
  guest: { label: 'Guest', icon: 'person-badge', field: 'Email', placeholder: 'you@example.com', mode: 'email', example: 'u_guest1' },
};

export default function Login() {
  useTitle('Sign in');
  const user = useCurrentUser();
  const users = useStore((s) => s.users);
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState('student');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [validated, setValidated] = useState(false);

  if (user) return <Navigate to="/" replace />;
  const t = TABS[tab];
  const example = byId(users, t.example);

  const finish = (mustChange) => {
    const dest = location.state?.from || '/';
    navigate(mustChange ? '/change-password' : dest, { replace: true, state: mustChange ? { next: dest } : undefined });
  };

  const submit = (e) => {
    e.preventDefault();
    setValidated(true);
    setError('');
    if (!identifier.trim() || !password) return;
    setBusy(true);
    setTimeout(() => {
      const r = login(identifier, password);
      setBusy(false);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      session.set(r.userId);
      finish(r.mustChangePassword);
    }, 450);
  };

  const quick = (id) => {
    quickLogin(id);
    finish(byId(users, id)?.mustChangePassword);
  };

  return (
    <Row className="g-4 auth-wrap">
      <Col lg={5}>
        <Panel title="Sign in to Smart Campus Events" icon="box-arrow-in-right" className="auth-panel">
          <Nav variant="tabs" activeKey={tab} onSelect={(k) => { setTab(k); setError(''); setValidated(false); }} className="mb-3" role="tablist">
            {Object.entries(TABS).map(([k, v]) => (
              <Nav.Item key={k}>
                <Nav.Link eventKey={k} role="tab" aria-selected={tab === k}><i className={`bi bi-${v.icon} me-1`} aria-hidden="true" />{v.label}</Nav.Link>
              </Nav.Item>
            ))}
          </Nav>
          {error && <Alert variant="danger" className="py-2 small" role="alert"><i className="bi bi-exclamation-octagon me-2" />{error}</Alert>}
          <Form noValidate validated={validated} onSubmit={submit}>
            <Form.Group className="mb-3" controlId="login-id">
              <Form.Label>{t.field}</Form.Label>
              <Form.Control
                value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={t.placeholder}
                inputMode={t.mode} autoComplete="username" required autoFocus
              />
              <Form.Control.Feedback type="invalid">Enter your {t.field.toLowerCase()}.</Form.Control.Feedback>
            </Form.Group>
            <Form.Group className="mb-2" controlId="login-pw">
              <div className="d-flex justify-content-between">
                <Form.Label>Password</Form.Label>
                <Link to="/forgot" className="small">Forgot password?</Link>
              </div>
              <PasswordInput value={password} onChange={setPassword} isInvalid={validated && !password} />
            </Form.Group>
            <Form.Check id="remember" className="mb-3 small" label="Keep me signed in on this device" defaultChecked />
            <Button type="submit" className="w-100" disabled={busy}>
              {busy ? <><Spinner size="sm" className="me-2" />Signing in…</> : 'Sign in'}
            </Button>
          </Form>
          <div className="small text-muted-2 mt-3">
            Demo: try <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => { setIdentifier(example?.urn || example?.email || ''); setPassword(DEMO_PASSWORD); }}>{example?.urn || example?.email}</button> with password <code>{DEMO_PASSWORD}</code>. Five wrong attempts lock the account.
          </div>
          {tab === 'guest' && (
            <Alert variant="info" className="small mt-3 mb-0">
              From another college? <Link to="/signup">Create a guest account</Link> to register for events open to external participants.
            </Alert>
          )}
        </Panel>
      </Col>
      <Col lg={7}>
        <Panel title="Demo accounts — one click sign-in" icon="people">
          <p className="small text-muted-2">Each account shows a different role. Use <strong>Demo tools</strong> (bottom right) to switch at any time.</p>
          <Row className="g-2">
            {DEMO_ACCOUNTS.map((a) => {
              const u = byId(users, a.id);
              if (!u) return null;
              return (
                <Col sm={6} key={a.id}>
                  <button type="button" className="demo-account" onClick={() => quick(a.id)}>
                    <Avatar user={u} size={38} />
                    <span className="min-w-0">
                      <span className="d-flex gap-2 align-items-center flex-wrap"><strong className="small">{u.name}</strong><RoleBadge role={u.role} /></span>
                      <span className="d-block small-2 text-muted-2">{a.blurb}</span>
                    </span>
                  </button>
                </Col>
              );
            })}
          </Row>
        </Panel>
        <Panel title="What this system does" icon="info-circle">
          <Row className="g-3 small">
            {[
              ['calendar-check', 'Event registration', 'Eligibility checks by department, semester and section, with waitlists and approvals.'],
              ['qr-code', 'Secure digital passes', 'Each pass is a one-time QR token verified on the server. Screenshots of used passes are rejected.'],
              ['upc-scan', 'Gate verification', 'Security staff scan at assigned gates; attendance is recorded with gate and time.'],
              ['map', 'Campus map', 'Every event links to its venue on the campus map with directions.'],
              ['bar-chart-line', 'Analytics & reports', 'Department-wise, semester-wise and gate-wise insights with CSV export.'],
              ['journal-text', 'Audit trail', 'Every sensitive action is logged for the administration.'],
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
