import { useState } from 'react';
import { Alert, Button, Col, Form, Row } from 'react-bootstrap';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CATEGORIES, MODES } from '../../data/constants';
import { useStore } from '../../store/store';
import { useCurrentUser } from '../../store/session';
import { byId, canManage, eventStats, gatesForEvent, myRegistration, passForRegistration, waitlistPosition } from '../../store/selectors';
import { cancelMyRegistration, register } from '../../store/actions';
import { checkEligibility, eligibilitySummary, eventPhase, registrationWindow } from '../../utils/eligibility';
import { fmtDateTime, fmtRange, fmtTime } from '../../utils/format';
import { downloadText, eventToICS } from '../../utils/files';
import { useTitle } from '../../utils/hooks';
import { CategoryChip, Countdown, EmptyState, ModeBadge, Panel, SeatsBar, StatusBadge, Tag } from '../../components/ui';
import { confirmDialog, toast } from '../../components/feedback';
import CampusMap from '../../components/CampusMap';

function Steps({ reg, pass, attended }) {
  const steps = [];
  steps.push({ label: 'Registered', sub: fmtDateTime(reg.registeredAt), state: 'done' });
  if (reg.status === 'PENDING') steps.push({ label: 'Awaiting organizer approval', state: 'current' });
  else if (reg.status === 'WAITLISTED') steps.push({ label: 'On the waitlist', state: 'current' });
  else if (reg.status === 'REJECTED') steps.push({ label: 'Not approved', sub: reg.reason, state: 'fail' });
  else if (reg.status === 'CANCELLED') steps.push({ label: 'Cancelled', sub: reg.reason, state: 'fail' });
  else steps.push({ label: 'Seat confirmed', sub: reg.decidedAt && fmtDateTime(reg.decidedAt), state: 'done' });
  const passOk = reg.status === 'APPROVED' && pass;
  steps.push({ label: 'QR pass issued', sub: passOk ? pass.code : null, state: passOk ? 'done' : 'todo' });
  steps.push({ label: 'Checked in at gate', sub: attended ? fmtDateTime(attended.at) : null, state: attended ? 'done' : 'todo' });
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

function RegistrationBox({ ev, user, s }) {
  const navigate = useNavigate();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const st = eventStats(s, ev.id);
  const venue = byId(s.locations, ev.venueId);
  const reg = myRegistration(s, ev.id, user.id);
  const pass = reg && passForRegistration(s, reg.id);
  const attended = reg && s.attendance.find((a) => a.registrationId === reg.id);
  const elig = checkEligibility(user, ev);
  const win = registrationWindow(ev);
  const active = reg && reg.status !== 'CANCELLED';
  const started = Date.now() >= ev.startsAt;

  const doRegister = async () => {
    const full = st.remaining <= 0 && ev.mode === 'OPEN';
    const yes = await confirmDialog({
      title: ev.mode === 'APPROVAL' ? 'Send a request to join?' : full ? 'Join the waitlist?' : 'Confirm registration',
      message: `${ev.title} · ${fmtRange(ev.startsAt, ev.endsAt)} · ${venue?.name}`,
      details: full ? <Alert variant="info" className="small mb-0">The event is full. If a seat opens up you will be confirmed automatically and notified.</Alert> : null,
      confirmText: ev.mode === 'APPROVAL' ? 'Send request' : full ? 'Join waitlist' : 'Register',
    });
    if (!yes) return;
    setBusy(true);
    setTimeout(() => {
      const r = register(ev.id, note);
      setBusy(false);
      toast.result(r);
    }, 350);
  };
  const doCancel = async () => {
    const yes = await confirmDialog({
      title: reg.status === 'APPROVED' ? 'Cancel your registration?' : 'Withdraw your request?',
      message: reg.status === 'APPROVED' ? 'Your QR pass will stop working and your seat may go to someone on the waitlist.' : 'You can register again later if seats are still available.',
      confirmText: reg.status === 'APPROVED' ? 'Cancel registration' : 'Withdraw', variant: 'danger', cancelText: 'Keep it',
    });
    if (yes) toast.result(cancelMyRegistration(reg.id));
  };

  let body;
  if (active && reg.status === 'APPROVED') {
    body = (
      <>
        <Alert variant={attended ? 'primary' : 'success'} className="py-2 small mb-3">
          <i className={`bi bi-${attended ? 'door-open' : 'check-circle'} me-2`} />
          {attended ? `You checked in at ${fmtTime(attended.at)}.` : 'You are registered. Show your QR pass at the gate.'}
        </Alert>
        {!attended && <Button className="w-100 mb-2" onClick={() => navigate(`/my/passes?open=${pass?.id}`)}><i className="bi bi-qr-code me-2" />Show my pass</Button>}
        {!started && <Button variant="outline-danger" className="w-100" size="sm" onClick={doCancel}>Cancel registration</Button>}
      </>
    );
  } else if (active && reg.status === 'PENDING') {
    body = (
      <>
        <Alert variant="warning" className="py-2 small"><i className="bi bi-hourglass-split me-2" />Your request is with the organizer. You'll get a notification when they decide.</Alert>
        <Button variant="outline-danger" size="sm" className="w-100" onClick={doCancel}>Withdraw request</Button>
      </>
    );
  } else if (active && reg.status === 'WAITLISTED') {
    body = (
      <>
        <Alert variant="info" className="py-2 small"><i className="bi bi-list-ol me-2" />You are <strong>#{waitlistPosition(s, reg)}</strong> on the waitlist. If a seat opens, you're confirmed automatically.</Alert>
        <Button variant="outline-danger" size="sm" className="w-100" onClick={doCancel}>Leave waitlist</Button>
      </>
    );
  } else if (active && reg.status === 'REJECTED') {
    body = <Alert variant="danger" className="py-2 small mb-0"><i className="bi bi-x-circle me-2" />Your request was not approved{reg.reason ? `: ${reg.reason}` : '.'}</Alert>;
  } else if (ev.mode === 'AUTO_ASSIGN') {
    body = (
      <Alert variant="info" className="py-2 small mb-0">
        <i className="bi bi-magic me-2" />No sign-up needed. The organizer issues passes to every eligible student{elig.eligible ? ' — yours will appear in My Passes.' : '.'}
      </Alert>
    );
  } else if (!elig.eligible) {
    body = <Button className="w-100" disabled><i className="bi bi-slash-circle me-2" />You're not eligible</Button>;
  } else if (!win.open) {
    body = <Button className="w-100" disabled><i className="bi bi-lock me-2" />{win.reason}</Button>;
  } else {
    const full = st.remaining <= 0;
    body = (
      <>
        {ev.mode === 'APPROVAL' && (
          <Form.Group controlId="reg-note" className="mb-2">
            <Form.Label className="small">Note to the organizer <span className="text-muted-2 fw-normal">(optional)</span></Form.Label>
            <Form.Control as="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. team name, idea summary" maxLength={200} />
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
      {ev.status !== 'CANCELLED' && <div className="mb-3"><SeatsBar approved={st.approved} capacity={ev.capacity} waitlisted={st.waitlisted} /></div>}
      {body}
      {reg && <Steps reg={reg} pass={pass} attended={attended} />}
    </Panel>
  );
}

export default function EventDetail() {
  const { id } = useParams();
  const s = useStore();
  const user = useCurrentUser();
  const ev = byId(s.events, id);
  useTitle(ev?.title || 'Event');
  if (!ev || (ev.status === 'DRAFT' && !canManage(user, ev)) || (user.role === 'GUEST' && !ev.allowOutsiders)) {
    return <EmptyState icon="calendar-x" title="Event not found" action={<Button as={Link} to="/events">Back to events</Button>}>It may have been removed or isn't visible to your account.</EmptyState>;
  }
  const cat = CATEGORIES[ev.category];
  const venue = byId(s.locations, ev.venueId);
  const gates = gatesForEvent(s, ev);
  const organizers = ev.organizerIds.map((o) => byId(s.users, o)).filter(Boolean);
  const participant = ['STUDENT', 'GUEST'].includes(user.role);
  const elig = participant ? checkEligibility(user, ev) : null;
  const phase = eventPhase(ev);

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
          <span><i className="bi bi-geo-alt" aria-hidden="true" />{venue?.name}</span>
          <span><i className="bi bi-people" aria-hidden="true" />{ev.capacity} seats</span>
        </div>
        {canManage(user, ev) && (
          <Button as={Link} to={`/manage/events/${ev.id}`} variant="light" size="sm" className="mt-3"><i className="bi bi-gear me-1" />Manage this event</Button>
        )}
      </section>

      {ev.status === 'CANCELLED' && (
        <Alert variant="danger"><i className="bi bi-x-octagon me-2" /><strong>This event was cancelled.</strong> {ev.cancelReason}</Alert>
      )}

      <Row className="g-3">
        <Col lg={8} className="section-gap">
          <Panel title="About this event" icon="file-text">
            {ev.description.split('\n').filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
            <div className="d-flex flex-wrap gap-2">
              <ModeBadge mode={ev.mode} />
              {ev.allowOutsiders && <Tag tone="info" icon="globe2">Guests welcome</Tag>}
              <Tag icon="person-workspace">{organizers.map((o) => o.name).join(', ')}</Tag>
            </div>
            <p className="small text-muted-2 mt-2 mb-0">{MODES[ev.mode].desc}</p>
          </Panel>

          <Row className="g-3">
            <Col md={6}>
              <Panel title="Who can join" icon="person-check" className="h-100">
                {elig ? (
                  <>
                    <ul className="checklist">
                      {elig.reasons.map((r) => (
                        <li key={r.label}>
                          <i className={`bi bi-${r.ok ? 'check-circle-fill' : 'x-circle-fill'}`} aria-hidden="true" />
                          <span><span className="visually-hidden">{r.ok ? 'Met: ' : 'Not met: '}</span>{r.label}{!r.ok && r.detail && <span className="d-block small-2 text-muted-2">{r.detail}</span>}</span>
                        </li>
                      ))}
                    </ul>
                    <div className={`small fw-600 mt-2 ${elig.eligible ? 'text-success' : 'text-danger'}`}>{elig.eligible ? 'You meet all the requirements.' : 'You do not meet every requirement for this event.'}</div>
                  </>
                ) : (
                  <p className="small mb-0">{eligibilitySummary(ev)}</p>
                )}
              </Panel>
            </Col>
            <Col md={6}>
              <Panel title="Schedule" icon="clock" className="h-100">
                <dl className="pass-facts">
                  <dt>Starts</dt><dd>{fmtDateTime(ev.startsAt)}</dd>
                  <dt>Ends</dt><dd>{fmtDateTime(ev.endsAt)}</dd>
                  <dt>Gates open</dt><dd>{fmtTime(ev.startsAt - 36e5)}</dd>
                  <dt>Registration</dt><dd>{fmtDateTime(ev.regOpensAt)} – {fmtDateTime(ev.regClosesAt)}</dd>
                  <dt>Entry gates</dt><dd>{gates.map((g) => g.name).join(', ') || 'To be announced'}</dd>
                </dl>
                <Button variant="outline-primary" size="sm" className="mt-3" onClick={() => downloadText(`${ev.title}.ics`, eventToICS(ev, venue?.name), 'text/calendar')}>
                  <i className="bi bi-calendar-plus me-1" />Add to calendar
                </Button>
              </Panel>
            </Col>
          </Row>

          <Panel title={`Venue — ${venue?.name}`} icon="geo-alt" actions={<Link to={`/campus?loc=${venue?.id}`} className="small">Open campus map</Link>}>
            <Row className="g-3 align-items-start">
              <Col md={7}><CampusMap locations={venue ? [venue] : []} selectedId={venue?.id} height={240} zoom={18} /></Col>
              <Col md={5} className="small">
                <div className="fw-600">{venue?.building}</div>
                <div className="text-muted-2 mb-2">Floor: {venue?.floor}</div>
                <p>{venue?.description}</p>
                <Button size="sm" variant="primary" href={`https://www.google.com/maps/dir/?api=1&destination=${venue?.lat},${venue?.lng}`} target="_blank" rel="noreferrer">
                  <i className="bi bi-signpost-split me-1" />Directions
                </Button>
              </Col>
            </Row>
          </Panel>
        </Col>

        <Col lg={4}>
          <div className="sticky-lg section-gap">
            {participant ? (
              <RegistrationBox ev={ev} user={user} s={s} />
            ) : (
              <Panel title="Registration" icon="ticket-perforated">
                <SeatsBar approved={eventStats(s, ev.id).approved} capacity={ev.capacity} waitlisted={eventStats(s, ev.id).waitlisted} />
                <p className="small text-muted-2 mt-3 mb-0">You're viewing this as {user.role.toLowerCase()}. Students and guests register from this panel.</p>
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
