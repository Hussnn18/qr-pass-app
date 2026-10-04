import { useState } from 'react';
import { Alert, Button, Col, Form, Row } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { DEMO_OTP } from '../../data/constants';
import { findAccount, resetPassword } from '../../store/actions';
import { useTitle } from '../../utils/hooks';
import { Panel } from '../../components/ui';
import { toast } from '../../components/feedback';
import { PasswordInput, StrengthMeter, passwordOk } from './PasswordField';

const mask = (email) => email.replace(/^(.{2}).*(@.*)$/, '$1•••$2');

export default function ForgotPassword() {
  useTitle('Reset password');
  const [step, setStep] = useState(0);
  const [identifier, setIdentifier] = useState('');
  const [account, setAccount] = useState(null);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  const send = (e) => {
    e.preventDefault();
    const r = findAccount(identifier);
    if (!r.ok) return setError(r.message);
    setError('');
    setAccount(r);
    setStep(1);
    toast.info(`Demo: your reset code is ${DEMO_OTP}`, 'Code sent');
  };
  const reset = (e) => {
    e.preventDefault();
    const r = resetPassword(account.userId, code, pw);
    if (!r.ok) return setError(r.message);
    setError('');
    setStep(2);
  };

  return (
    <Row className="justify-content-center">
      <Col md={8} lg={5}>
        <Panel title="Reset your password" icon="key">
          {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}
          {step === 0 && (
            <Form onSubmit={send}>
              <p className="small text-muted-2">Enter your URN or email. We'll email a one-time code to the address on your account.</p>
              <Form.Group controlId="fp-id" className="mb-3">
                <Form.Label>URN or email</Form.Label>
                <Form.Control value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoFocus />
              </Form.Group>
              <div className="d-flex justify-content-between align-items-center">
                <Link to="/login" className="small"><i className="bi bi-arrow-left me-1" />Back to sign in</Link>
                <Button type="submit" disabled={!identifier.trim()}>Send code</Button>
              </div>
            </Form>
          )}
          {step === 1 && (
            <Form onSubmit={reset}>
              <p className="small">Code sent to <strong>{mask(account.email)}</strong>. It expires in 10 minutes.</p>
              <Form.Group controlId="fp-code" className="mb-3">
                <Form.Label>6-digit code</Form.Label>
                <Form.Control className="otp-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus />
                <Form.Text>Demo code: {DEMO_OTP}</Form.Text>
              </Form.Group>
              <Form.Group controlId="fp-pw" className="mb-3">
                <Form.Label>New password</Form.Label>
                <PasswordInput value={pw} onChange={setPw} autoComplete="new-password" />
                <StrengthMeter value={pw} />
              </Form.Group>
              <Button type="submit" className="w-100" disabled={code.length !== 6 || !passwordOk(pw)}>Reset password</Button>
            </Form>
          )}
          {step === 2 && (
            <div className="text-center py-3">
              <i className="bi bi-shield-check text-success" style={{ fontSize: '3rem' }} aria-hidden="true" />
              <h2 className="h5 fw-bold mt-2">Password updated</h2>
              <p className="text-muted-2 small">Any lock on the account has been cleared.</p>
              <Button as={Link} to="/login">Sign in</Button>
            </div>
          )}
        </Panel>
      </Col>
    </Row>
  );
}
