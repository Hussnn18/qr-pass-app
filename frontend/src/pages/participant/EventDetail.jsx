import { useState } from 'react';
import { Alert, Button, Col, Form, Row } from 'react-bootstrap';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useApi } from '../../api/useApi';
import { CATEGORIES, MODES } from '../../data/constants';
import { useCurrentUser } from '../../auth/AuthContext';
import { eligibilitySummary, eventPhase } from '../../utils/events';
import { fmtDateTime, fmtRange, fmtTime } from '../../utils/format';
import { downloadText, eventToICS } from '../../utils/files';
import { useTitle } from '../../utils/hooks';
import { CategoryChip, Countdown, EmptyState, Loading, ModeBadge, Panel, SeatsBar, StatusBadge, Tag } from '../../components/ui';
import { attempt, confirmDialog } from '../../components/feedback';

function Steps({ reg }) {
  const steps = [{ label: 'Registered', sub: fmtDateTime(reg.registeredAt), state: 'done' }];
  if (reg.status === 'PENDING') steps.push({ label: 'Awaiting organizer approval', state: 'current' });
  else if (reg.status === 'WAITLISTED') steps.push({ label: `On the waitlist (#${reg.waitlistPosition})`, state: 'current' });
  else if (reg.status === 'REJECTED') steps.push({ label: 'Not approved', sub: reg.reason, state: 'fail' });
  else if (reg.status === 'CANCELLED') steps.push({ label: 'Cancelled', sub: reg.reason, state: 'fail' });
  else steps.push({ label: 'Seat confirmed', sub: reg.decidedAt && fmtDateTime(reg.decidedAt), state: 'done' });
  const passOk = reg.status === 'CONFIRMED' && reg.pass;
  steps.push({ label: 'QR pass issued', sub: passOk ? reg.pass.code : null, state: passOk ? 'done' : 'todo' });
  steps.push({ label: 'Entered at the gate', sub: reg.entry ? `${fmtDateTime(reg.entry.at)} · ${reg.entry.gateName}` : null, state: reg.entry ? 'done' : 'todo' });
  return (
    <ul className="steps-v mt-3" aria-label="Registration progress">
      {steps.map((st) => (
        <li key={st.label} className={st.state}>
          <span className="dot">{st.state === 'done' ? <i className="bi bi-check" /> : st.state === 'fail' ? <i className="bi bi-x" /> : ''}</span>
          <div className="fw-600">{st.label}</div>
          {st.sub && <div className="small-2 text-muted-2">{st.sub}</div>}
        </li>
      ))}
    </ul>
  );
}

function RegistrationBox({ ev, reload }) {
  const navigate = useNavigate();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const st = ev.stats;
  const reg = ev.myRegistration;
  const active = reg && ['PENDING', 'CONFIRMED', 'WAITLISTED'].includes(reg.status);
  const elig = ev.eligibilityCheck;
  const started = Date.now() >= ev.startsAt;

  const doRegister = async () => {
    const full = st.remaining <= 0 && ev.mode === 'OPEN';
    const yes = await confirmDialog({
      title: ev.mode === 'APPROVAL' ? 'Send a request to join?' : full ? 'Join the waitlist?' : 'Confirm registration',
      message: `${ev.title} · ${fmtRange(ev.startsAt, ev.endsAt)} · ${ev.venue.name}`,
      details: full ? <Alert variant="info" className="small mb-0">The event is full. If a seat opens up you'll be confirmed automatically.</Alert> : null,
      confirmText: ev.mode === 'APPROVAL' ? 'Send request' : full ? 'Join waitlist' : 'Register',
    });
    if (!yes) return;
    setBusy(true);
    await attempt(() => api(`/events/${ev.id}/registrations`, { method: 'POST', body: { note: note || null } }), (r) => r.message);
    setBusy(false);
    reload();
  };
  const doCancel = async () => {
    const yes = await confirmDialog({
      title: reg.status === 'CONFIRMED' ? 'Cancel your registration?' : 'Withdraw your request?',
      message: reg.status === 'CONFIRMED' ? 'Your QR pass will stop working and your seat may go to someone on the waitlist.' : 'You can register again later if seats are still available.',
      confirmText: reg.status === 'CONFIRMED' ? 'Cancel registration' : 'Withdraw', variant: 'danger', cancelText: 'Keep it',
    });
    if (!yes) return;
    await attempt(() => api(`/me/registrations/${reg.id}/cancel`, { method: 'POST' }), (r) => r.message);
    reload();
  };

  let body;
  if (active && reg.status === 'CONFIRMED') {
    body = (
      <>
        <Alert variant={reg.entry ? 'primary' : 'success'} className="py-2 small mb-3">
          <i className={`bi bi-${reg.entry ? 'door-open' : 'check-circle'} me-2`} />
          {reg.entry ? `You entered at ${fmtTime(reg.entry.at)} (${reg.entry.gateName}).` : 'You are registered. Show your QR pass at the gate.'}
        </Alert>
        {!reg.entry && reg.pass?.status === 'ACTIVE' && <Button className="w-100 mb-2" onClick={() => navigate(`/my/passes?open=${reg.pass.id}`)}><i className="bi bi-qr-code me-2" />Show my pass</Button>}
        {!started && !reg.entry && <Button variant="outline-danger" className="w-100" size="sm" onClick={doCancel}>Cancel registration</Button>}
      </>
    );
  } else if (active && reg.status === 'PENDING') {
    body = (
      <>
        <Alert variant="warning" className="py-2 small"><i className="bi bi-hourglass-split me-2" />Your request is with the organizer. Check back here for the decision.</Alert>
        <Button variant="outline-danger" size="sm" className="w-100" onClick={doCancel}>Withdraw request</Button>
      </>
    );
  } else if (active && reg.status === 'WAITLISTED') {
    body = (
      <>
        <Alert variant="info" className="py-2 small"><i className="bi bi-list-ol me-2" />You are <strong>#{reg.waitlistPosition}</strong> on the waitlist. If a seat opens, you're confirmed automatically.</Alert>
        <Button variant="outline-danger" size="sm" className="w-100" onClick={doCancel}>Leave waitlist</Button>
      </>
    );
  } else if (reg?.status === 'REJECTED') {
    body = <Alert variant="danger" className="py-2 small mb-0"><i className="bi bi-x-circle me-2" />Your request was not approved{reg.reason ? `: ${reg.reason}` : '.'}</Alert>;
  } else if (ev.mode === 'AUTO_ASSIGN') {
    body = <Alert variant="info" className="py-2 small mb-0"><i className="bi bi-magic me-2" />No sign-up needed. The organizer issues passes to every eligible student{elig?.eligible ? ' — yours will appear in My Passes.' : '.'}</Alert>;
  } else if (elig && !elig.eligible) {
    body = <Button className="w-100" disabled><i className="bi bi-slash-circle me-2" />You're not eligible</Button>;
  } else if (!ev.window.open) {
    body = <Button className="w-100" disabled><i className="bi bi-lock me-2" />{ev.window.reason}</Button>;
  } else {
    const full = st.remaining <= 0;
    body = (
      <>
        {ev.mode === 'APPROVAL' && (
          <Form.Group controlId="reg-note" className="mb-2">
            <Form.Label className="small">Note to the organizer <span className="text-muted-2 fw-normal">(optional)</span></Form.Label>
            <Form.Control as="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. team name, idea summary" maxLength={300} />
          </Form.Group>
        )}
        <Button className="w-100" variant={full ? 'outline-primary' : 'brand'} onClick={doRegister} disabled={busy}>
          {busy ? 'Please wait…' : ev.mode === 'APPROVAL' ? 'Request to join' : full ? 'Join waitlist' : 'Register now'}
        </Button>
        <div className="small-2 text-muted-2 text-center mt-2"><Countdown to={ev.regClosesAt} prefix="Registration closes in" /></div>
        {reg?.status === 'CANCELLED' && <div className="small-2 text-muted-2 text-center mt-1">You cancelled earlier — you can register again.</div>}
      </>
    );
  }

  return (
    <Panel title="Registration" icon="ticket-perforated">
      {ev.status !== 'CANCELLED' && <div className="mb-3"><SeatsBar approved={st.confirmed} capacity={st.capacity} waitlisted={st.waitlisted} /></div>}
      {body}
      {reg && <Steps reg={reg} />}
    </Panel>
  );
}

export default function EventDetail() {
  const { id } = useParams();
  const user = useCurrentUser();
  const res = useApi(`/events/${id}`);
  const ev = res.data;
  useTitle(ev?.title || 'Event');
  if (res.error && !ev) {
    return <EmptyState icon="calendar-x" title="Event not found" action={<Button as={Link} to="/events">Back to events</Button>}>{res.error.message}</EmptyState>;
  }
  if (!ev) return <Loading />;
  const cat = CATEGORIES[ev.category];
  const participant = user.role === 'STUDENT' || user.role === 'GUEST';
  const phase = eventPhase(ev);
  const v = ev.venue;

  return (
    <>
      <nav aria-label="Breadcrumb">
        <ol className="breadcrumb small mb-2">
          <li className="breadcrumb-item"><Link to="/">Home</Link></li>
          <li className="breadcrumb-item"><Link to="/events">Events</Link></li>
          <li className="breadcrumb-item active" aria-current="page">{ev.title}</li>
        </ol>
      </nav>
      <section className="event-hero" style={{ '--cat': cat.color }}>
        <i className={`bi bi-${cat.icon} hero-icon`} aria-hidden="true" />
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <CategoryChip category={ev.category} />
          {phase === 'LIVE' && <span className="live-chip">● Live now</span>}
          {ev.status !== 'PUBLISHED' && <span className="cat-chip">{ev.status === 'CLOSED' ? 'Registration closed' : ev.status.toLowerCase()}</span>}
        </div>
        <h1>{ev.title}</h1>
        <div className="hero-facts">
          <span><i className="bi bi-calendar3" aria-hidden="true" />{fmtRange(ev.startsAt, ev.endsAt)}</span>
          <span><i className="bi bi-geo-alt" aria-hidden="true" />{v.name}</span>
          <span><i className="bi bi-people" aria-hidden="true" />{ev.stats.capacity} seats</span>
        </div>
        {ev.canManage && <Button as={Link} to={`/manage/events/${ev.id}`} variant="light" size="sm" className="mt-3"><i className="bi bi-gear me-1" />Manage this event</Button>}
      </section>

      {ev.status === 'CANCELLED' && <Alert variant="danger"><i className="bi bi-x-octagon me-2" /><strong>This event was cancelled.</strong> {ev.cancelReason}</Alert>}

      <Row className="g-3">
        <Col lg={8} className="section-gap">
          <Panel title="About this event" icon="file-text">
            {ev.description.split('\n').filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
            <div className="d-flex flex-wrap gap-2">
              <ModeBadge mode={ev.mode} />
              {ev.allowOutsiders && <Tag tone="info" icon="globe2">Guests welcome</Tag>}
              <Tag icon="person-workspace">{ev.organizers.map((o) => o.name).join(', ')}</Tag>
            </div>
            <p className="small text-muted-2 mt-2 mb-0">{MODES[ev.mode].desc}</p>
          </Panel>

          <Row className="g-3">
            <Col md={6}>
              <Panel title="Who can join" icon="person-check" className="h-100">
                {ev.eligibilityCheck ? (
                  <>
                    <ul className="checklist">
                      {ev.eligibilityCheck.reasons.map((r) => (
                        <li key={r.label}>
                          <i className={`bi bi-${r.ok ? 'check-circle-fill' : 'x-circle-fill'}`} aria-hidden="true" />
                          <span><span className="visually-hidden">{r.ok ? 'Met: ' : 'Not met: '}</span>{r.label}{!r.ok && r.detail && <span className="d-block small-2 text-muted-2">{r.detail}</span>}</span>
                        </li>
                      ))}
                    </ul>
                    <div className={`small fw-600 mt-2 ${ev.eligibilityCheck.eligible ? 'text-success' : 'text-danger'}`}>
                      {ev.eligibilityCheck.eligible ? 'You meet all the requirements.' : 'You do not meet every requirement for this event.'}
                    </div>
                  </>
                ) : <p className="small mb-0">{eligibilitySummary(ev.eligibility, ev.allowOutsiders)}</p>}
              </Panel>
            </Col>
            <Col md={6}>
              <Panel title="Schedule" icon="clock" className="h-100">
                <dl className="pass-facts">
                  <dt>Starts</dt><dd>{fmtDateTime(ev.startsAt)}</dd>
                  <dt>Ends</dt><dd>{fmtDateTime(ev.endsAt)}</dd>
                  <dt>Gates open</dt><dd>{fmtTime(ev.startsAt - 36e5)}</dd>
                  {ev.mode !== 'AUTO_ASSIGN' && <><dt>Registration</dt><dd>{fmtDateTime(ev.regOpensAt)} – {fmtDateTime(ev.regClosesAt)}</dd></>}
                  <dt>Entry gates</dt><dd>{ev.gates.map((g) => g.name).join(', ') || 'To be announced'}</dd>
                </dl>
                <Button variant="outline-primary" size="sm" className="mt-3" onClick={() => downloadText(`${ev.title}.ics`, eventToICS(ev, v.name), 'text/calendar')}>
                  <i className="bi bi-calendar-plus me-1" />Add to calendar
                </Button>
              </Panel>
            </Col>
          </Row>

          <Panel title={`Venue — ${v.name}`} icon="geo-alt">
            <div className="small">
              {v.building && <div className="fw-600">{v.building}</div>}
              {v.floor && v.floor !== '—' && <div className="text-muted-2 mb-2">Floor: {v.floor}</div>}
              {v.description && <p>{v.description}</p>}
              {v.lat != null && (
                <Button size="sm" variant="primary" href={`https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}`} target="_blank" rel="noreferrer">
                  <i className="bi bi-signpost-split me-1" />Directions
                </Button>
              )}
            </div>
          </Panel>
        </Col>

        <Col lg={4}>
          <div className="sticky-lg section-gap">
            {participant ? <RegistrationBox ev={ev} reload={res.reload} /> : (
              <Panel title="Registration" icon="ticket-perforated">
                <SeatsBar approved={ev.stats.confirmed} capacity={ev.stats.capacity} waitlisted={ev.stats.waitlisted} />
                <p className="small text-muted-2 mt-3 mb-0">You're viewing this as {user.role.toLowerCase()}. Students register from this panel.</p>
              </Panel>
            )}
            <Panel title="Status" icon="info-circle">
              <div className="d-flex flex-wrap gap-2"><StatusBadge kind="event" status={ev.status} /><ModeBadge mode={ev.mode} /></div>
            </Panel>
          </div>
        </Col>
      </Row>
    </>
  );
}
