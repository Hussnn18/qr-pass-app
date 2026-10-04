import { useState } from 'react';
import { Alert, Button, Col, Form, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { DEMO_OTP } from '../../data/constants';
import { signupGuest, verifyGuest } from '../../store/actions';
import { useTitle } from '../../utils/hooks';
import { Panel } from '../../components/ui';
import { toast } from '../../components/feedback';
import { PasswordInput, StrengthMeter, passwordOk } from './PasswordField';

const STEPS = ['Your details', 'Verify email', 'Done'];

export default function GuestSignup() {
  useTitle('Guest sign-up');
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ name: '', email: '', phone: '', organization: '', password: '', confirm: '', terms: false });
  const [validated, setValidated] = useState(false);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState(null);
  const [otp, setOtp] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email);
  const phoneOk = /^[+\d][\d\s-]{9,}$/.test(f.phone);
  const valid = f.name.trim().length > 2 && emailOk && phoneOk && f.organization.trim() && passwordOk(f.password) && f.password === f.confirm && f.terms;

  const submit = (e) => {
    e.preventDefault();
    setValidated(true);
    setError('');
    if (!valid) return;
    const r = signupGuest(f);
    if (!r.ok) return setError(r.message);
    setUserId(r.userId);
    setStep(1);
    toast.info(`Demo: the verification code is ${DEMO_OTP}`, 'Code sent');
  };

  const verify = (e) => {
    e.preventDefault();
    const r = verifyGuest(userId, otp);
    if (!r.ok) return setError(r.message);
    setError('');
    setStep(2);
  };

  return (
    <Row className="justify-content-center">
      <Col lg={7} xl={6}>
        <ol className="stepper" aria-label="Sign-up progress">
          {STEPS.map((label, i) => (
            <li key={label} className={i === step ? 'active' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
              <button type="button" disabled><span className="step-num">{i < step ? <i className="bi bi-check" /> : i + 1}</span>{label}</button>
            </li>
          ))}
        </ol>
        <Panel title="Create a guest account" icon="person-plus">
          {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}
          {step === 0 && (
            <Form noValidate onSubmit={submit}>
              <p className="small text-muted-2">For students and visitors from other institutions. You can register only for events marked <em>Guests welcome</em>.</p>
              <Row className="g-3">
                <Col md={6}>
                  <Form.Group controlId="g-name"><Form.Label>Full name</Form.Label>
                    <Form.Control value={f.name} onChange={set('name')} autoComplete="name" isInvalid={validated && f.name.trim().length <= 2} required />
                    <Form.Control.Feedback type="invalid">Enter your full name.</Form.Control.Feedback>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="g-org"><Form.Label>College / organization</Form.Label>
                    <Form.Control value={f.organization} onChange={set('organization')} autoComplete="organization" isInvalid={validated && !f.organization.trim()} required />
                    <Form.Control.Feedback type="invalid">Tell us where you're from.</Form.Control.Feedback>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="g-email"><Form.Label>Email</Form.Label>
                    <Form.Control type="email" value={f.email} onChange={set('email')} autoComplete="email" isInvalid={validated && !emailOk} required />
                    <Form.Control.Feedback type="invalid">Enter a valid email — we'll send a code to it.</Form.Control.Feedback>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="g-phone"><Form.Label>Mobile number</Form.Label>
                    <Form.Control type="tel" value={f.phone} onChange={set('phone')} autoComplete="tel" placeholder="+91 98xxx xxxxx" isInvalid={validated && !phoneOk} required />
                    <Form.Control.Feedback type="invalid">Enter a 10-digit mobile number.</Form.Control.Feedback>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="g-pw"><Form.Label>Password</Form.Label>
                    <PasswordInput value={f.password} onChange={(v) => setF((x) => ({ ...x, password: v }))} autoComplete="new-password" isInvalid={validated && !passwordOk(f.password)} />
                    <StrengthMeter value={f.password} />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="g-confirm"><Form.Label>Confirm password</Form.Label>
                    <Form.Control type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" isInvalid={validated && f.confirm !== f.password} required />
                    <Form.Control.Feedback type="invalid">Passwords don't match.</Form.Control.Feedback>
                  </Form.Group>
                </Col>
                <Col xs={12}>
                  <Form.Check id="g-terms" checked={f.terms} onChange={set('terms')} isInvalid={validated && !f.terms}
                    label="I agree to follow campus rules and carry a photo ID to events." feedback="Please accept to continue." feedbackType="invalid" />
                </Col>
              </Row>
              <div className="d-flex justify-content-between align-items-center mt-4">
                <Link to="/login" className="small">Already have an account?</Link>
                <Button type="submit">Create account</Button>
              </div>
            </Form>
          )}
          {step === 1 && (
            <Form onSubmit={verify} className="text-center">
              <i className="bi bi-envelope-check" style={{ fontSize: '2.6rem', color: 'var(--gn-navy)' }} aria-hidden="true" />
              <p className="mt-2">We sent a 6-digit code to <strong>{f.email}</strong>.</p>
              <Form.Group controlId="otp" className="mx-auto" style={{ maxWidth: 260 }}>
                <Form.Label className="visually-hidden">Verification code</Form.Label>
                <Form.Control className="otp-input" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="••••••" />
              </Form.Group>
              <p className="small text-muted-2 mt-2">Demo code: <code>{DEMO_OTP}</code> · <button type="button" className="btn btn-link btn-sm p-0" onClick={() => toast.info(`Code re-sent: ${DEMO_OTP}`)}>Resend</button></p>
              <Button type="submit" disabled={otp.length !== 6}>Verify email</Button>
            </Form>
          )}
          {step === 2 && (
            <div className="text-center py-3">
              <i className="bi bi-check-circle-fill text-success" style={{ fontSize: '3rem' }} aria-hidden="true" />
              <h2 className="h5 mt-2 fw-bold">Your account is ready</h2>
              <p className="text-muted-2">Sign in with your email to see events open to external participants.</p>
              <Button as={Link} to="/login">Go to sign in</Button>
            </div>
          )}
        </Panel>
      </Col>
    </Row>
  );
}
