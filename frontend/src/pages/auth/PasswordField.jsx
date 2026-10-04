import { useState } from 'react';
import { Button, Form, InputGroup } from 'react-bootstrap';

export const PASSWORD_RULES = [
  { id: 'len', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'upper', label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'digit', label: 'A number', test: (p) => /\d/.test(p) },
];
export const passwordOk = (p) => PASSWORD_RULES.every((r) => r.test(p));

export function PasswordInput({ value, onChange, autoComplete = 'current-password', isInvalid, placeholder, autoFocus }) {
  const [show, setShow] = useState(false);
  return (
    <InputGroup hasValidation>
      <Form.Control
        type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete} isInvalid={isInvalid} placeholder={placeholder} autoFocus={autoFocus} required
      />
      <Button variant="light" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
        <i className={`bi bi-${show ? 'eye-slash' : 'eye'}`} aria-hidden="true" />
      </Button>
    </InputGroup>
  );
}

export function StrengthMeter({ value }) {
  const met = PASSWORD_RULES.filter((r) => r.test(value)).length;
  const colors = ['#d9dce2', '#b42318', '#a35f00', '#0e6e8c', '#1e7b4b'];
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  return (
    <div className="mt-2" aria-live="polite">
      <div className="pw-meter"><span style={{ width: `${met * 25}%`, background: colors[met] }} /></div>
      <ul className="rules">
        {PASSWORD_RULES.map((r) => (
          <li key={r.id} className={r.test(value) ? 'met' : ''}>
            <i className={`bi bi-${r.test(value) ? 'check-circle-fill' : 'circle'} me-1`} aria-hidden="true" />{r.label}
          </li>
        ))}
      </ul>
      {met > 0 && <span className="visually-hidden">Password strength: {labels[met]}</span>}
    </div>
  );
}
