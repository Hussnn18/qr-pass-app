import { useEffect, useState } from 'react';
import { Button, Form, Modal, Toast, ToastContainer } from 'react-bootstrap';

// ---------------------------------------------------------------- toasts
const toastListeners = new Set();
const TOAST_META = {
  success: { tone: 'success', icon: 'check-circle-fill', title: 'Done' },
  error: { tone: 'danger', icon: 'x-circle-fill', title: 'Something went wrong' },
  warning: { tone: 'warning', icon: 'exclamation-triangle-fill', title: 'Heads up' },
  info: { tone: 'info', icon: 'info-circle-fill', title: 'Info' },
};

export const toast = {
  show(type, message, title) {
    const t = { id: Math.random().toString(36).slice(2), type, message, title };
    toastListeners.forEach((l) => l(t));
  },
  success: (m, t) => toast.show('success', m, t),
  error: (m, t) => toast.show('error', m, t),
  warning: (m, t) => toast.show('warning', m, t),
  info: (m, t) => toast.show('info', m, t),
};

/**
 * Runs an API call, shows its error as a toast, and optionally a success toast.
 * Returns the result, or undefined when it failed.
 */
export async function attempt(fn, success) {
  try {
    const result = await fn();
    if (success) toast.success(typeof success === 'function' ? success(result) : success);
    return result;
  } catch (e) {
    toast.error(e.message);
    return undefined;
  }
}

export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const l = (t) => setItems((x) => [...x.slice(-3), t]);
    toastListeners.add(l);
    return () => toastListeners.delete(l);
  }, []);
  const close = (id) => setItems((x) => x.filter((i) => i.id !== id));
  return (
    <ToastContainer position="bottom-end" className="p-3 toast-host" style={{ zIndex: 2000, position: 'fixed' }}>
      {items.map((t) => {
        const m = TOAST_META[t.type];
        return (
          <Toast key={t.id} onClose={() => close(t.id)} delay={t.type === 'error' ? 6000 : 4000} autohide className={`tone-${m.tone}`}>
            <Toast.Header closeLabel="Dismiss">
              <i className={`bi bi-${m.icon} me-2`} style={{ color: 'var(--tone)' }} aria-hidden="true" />
              <strong className="me-auto">{t.title || m.title}</strong>
            </Toast.Header>
            <Toast.Body>{t.message}</Toast.Body>
          </Toast>
        );
      })}
    </ToastContainer>
  );
}

// ---------------------------------------------------------------- confirm dialog
let openConfirm = null;

/**
 * confirmDialog({ title, message, confirmText, variant, input: { label, placeholder, required } })
 * Resolves to true/false, or to the typed text when `input` is given (false when cancelled).
 */
export function confirmDialog(opts) {
  return new Promise((resolve) => {
    if (openConfirm) openConfirm(opts, resolve);
    else resolve(window.confirm(opts.message));
  });
}

export function ConfirmHost() {
  const [state, setState] = useState(null);
  const [text, setText] = useState('');
  useEffect(() => {
    openConfirm = (opts, resolve) => {
      setText(opts.input?.initial || '');
      setState({ opts, resolve });
    };
    return () => { openConfirm = null; };
  }, []);
  if (!state) return null;
  const { opts, resolve } = state;
  const close = (value) => {
    setState(null);
    resolve(value);
  };
  const blocked = opts.input?.required && !text.trim();
  return (
    <Modal show onHide={() => close(false)} centered>
      <Modal.Header closeButton>
        <Modal.Title>{opts.title}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={(e) => { e.preventDefault(); if (!blocked) close(opts.input ? text.trim() : true); }}>
        <Modal.Body>
          {opts.message && <p className="mb-2">{opts.message}</p>}
          {opts.details}
          {opts.input && (
            <Form.Group className="mt-2" controlId="confirm-input">
              <Form.Label>{opts.input.label}</Form.Label>
              <Form.Control as="textarea" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={opts.input.placeholder} autoFocus />
              {opts.input.hint && <Form.Text>{opts.input.hint}</Form.Text>}
            </Form.Group>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" onClick={() => close(false)}>{opts.cancelText || 'Cancel'}</Button>
          <Button type="submit" variant={opts.variant || 'primary'} disabled={blocked} autoFocus={!opts.input}>{opts.confirmText || 'Confirm'}</Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
