import { useEffect, useState } from 'react';
import { Button, Form, Offcanvas } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { DEMO_ACCOUNTS, REVIEW_FLOWS, ROLES } from '../../data/constants';
import { store, useStore } from '../../store/store';
import { session, useSessionUserId } from '../../store/session';
import { logout, quickLogin } from '../../store/actions';
import { byId } from '../../store/selectors';
import { fmtDateTime } from '../../utils/format';
import { usePersistentState } from '../../utils/hooks';
import { confirmDialog, toast } from '../feedback';
import { Avatar, RoleBadge } from '../ui';

/** Floating helper for reviewers: switch role, walk through UX flows, reset data. */
export default function DemoPanel() {
  const [show, setShow] = useState(false);
  const [done, setDone] = usePersistentState('scems_review_done', {});
  const s = useStore();
  const currentId = useSessionUserId();
  const navigate = useNavigate();

  useEffect(() => {
    const open = () => setShow(true);
    window.addEventListener('open-demo-panel', open);
    return () => window.removeEventListener('open-demo-panel', open);
  }, []);

  const go = (userId, to) => {
    if (userId === null) logout();
    else if (userId && userId !== session.get()) quickLogin(userId);
    const u = userId && byId(store.get().users, userId);
    setShow(false);
    if (u?.mustChangePassword) navigate('/change-password', { state: { next: to } });
    else if (to) navigate(to);
    else if (userId) navigate('/');
  };

  const reset = async () => {
    const yes = await confirmDialog({
      title: 'Reset demo data?',
      message: 'All registrations, scans, users and settings return to the original sample data. Dates are regenerated around today.',
      confirmText: 'Reset data', variant: 'danger',
    });
    if (!yes) return;
    store.reset();
    setDone({});
    toast.success('Demo data restored.');
    setShow(false);
    navigate(session.get() ? '/' : '/login');
  };

  const doneCount = REVIEW_FLOWS.filter((f) => done[f.id]).length;

  return (
    <>
      <Button className="demo-fab" variant="primary" onClick={() => setShow(true)} aria-haspopup="dialog">
        <i className="bi bi-person-video3 me-2" aria-hidden="true" />Demo tools
      </Button>
      <Offcanvas show={show} onHide={() => setShow(false)} placement="end" aria-labelledby="demo-title">
        <Offcanvas.Header closeButton className="border-bottom">
          <Offcanvas.Title id="demo-title" className="h5 mb-0" style={{ color: 'var(--gn-navy)', fontWeight: 700 }}>Demo tools</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>
          <p className="small text-muted-2">
            Mock data only — nothing leaves this browser. Open a second tab, sign in as another role, and both tabs update live.
          </p>

          <h2 className="h6 fw-bold mt-3">Switch account</h2>
          <div className="d-grid gap-2">
            {DEMO_ACCOUNTS.map((a) => {
              const u = byId(s.users, a.id);
              if (!u) return null;
              return (
                <button key={a.id} type="button" className="demo-account" onClick={() => go(a.id)} aria-current={currentId === a.id ? 'true' : undefined}>
                  <Avatar user={u} size={34} />
                  <span className="min-w-0 flex-grow-1">
                    <span className="d-flex gap-2 align-items-center flex-wrap"><strong className="small">{u.name}</strong><RoleBadge role={u.role} /></span>
                    <span className="d-block small-2 text-muted-2">{a.blurb}</span>
                  </span>
                  {currentId === a.id && <i className="bi bi-check-circle-fill text-success" aria-label="Current account" />}
                </button>
              );
            })}
          </div>

          <div className="d-flex justify-content-between align-items-center mt-4 mb-1">
            <h2 className="h6 fw-bold mb-0">UX review checklist</h2>
            <span className="small text-muted-2">{doneCount}/{REVIEW_FLOWS.length}</span>
          </div>
          {REVIEW_FLOWS.map((f) => (
            <div key={f.id} className="flow-item">
              <Form.Check
                id={`flow-${f.id}`}
                checked={!!done[f.id]}
                onChange={(e) => setDone((d) => ({ ...d, [f.id]: e.target.checked }))}
                aria-label={`Mark "${f.title}" reviewed`}
              />
              <div className="flex-grow-1 min-w-0">
                <label htmlFor={`flow-${f.id}`} className="small fw-600 d-block">{f.title}</label>
                {f.as !== undefined && (
                  <span className="small-2 text-muted-2">{f.as ? `as ${byId(s.users, f.as)?.name} (${ROLES[byId(s.users, f.as)?.role]?.label})` : f.to ? 'signed out' : 'any account'}</span>
                )}
              </div>
              {f.to && <Button size="sm" variant="outline-primary" onClick={() => go(f.as, f.to)}>Go</Button>}
            </div>
          ))}

          <h2 className="h6 fw-bold mt-4">Data</h2>
          <p className="small text-muted-2 mb-2">Sample data generated {fmtDateTime(s.seededAt)}.</p>
          <Button variant="outline-danger" size="sm" onClick={reset}><i className="bi bi-arrow-counterclockwise me-1" />Reset demo data</Button>
        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
}
