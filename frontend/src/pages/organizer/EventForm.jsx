import { useMemo, useState } from 'react';
import { Alert, Button, Col, Form, Row } from 'react-bootstrap';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CATEGORIES, LOCATION_TYPES, MODES, SECTIONS, SEMESTERS } from '../../data/constants';
import { useStore } from '../../store/store';
import { useCurrentUser } from '../../store/session';
import { byId, canManage, gatesForLocation } from '../../store/selectors';
import { saveEvent } from '../../store/actions';
import { countEligibleStudents, eligibilitySummary } from '../../utils/eligibility';
import { fmtDateTime, fmtRange, fromInputDT, toInputDT } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { EmptyState, PageHeader, Panel, Tag } from '../../components/ui';
import { toast } from '../../components/feedback';
import CampusMap from '../../components/CampusMap';

const STEPS = ['Basics', 'Venue & schedule', 'Registration', 'Eligibility', 'Gates & security', 'Review'];

function defaults() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(10, 0, 0, 0);
  const start = d.getTime();
  return {
    title: '', category: 'TECHNICAL', description: '', venueId: '', startsAt: start, endsAt: start + 3 * 36e5,
    regOpensAt: Date.now(), regClosesAt: start - 864e5, capacity: 100, mode: 'OPEN', allowOutsiders: false,
    eligibility: { departments: [], semesters: [], sections: [] }, gateIds: [], assignments: {}, organizerIds: [],
  };
}

function validate(f, s, isNew) {
  const e = {};
  const w = {};
  if (f.title.trim().length < 5) e.title = 'Give the event a title of at least 5 characters.';
  if (f.description.trim().length < 20) e.description = 'Describe the event in at least 20 characters so students know what to expect.';
  if (!f.venueId) e.venueId = 'Choose a venue.';
  if (!f.startsAt || !f.endsAt || f.endsAt <= f.startsAt) e.endsAt = 'The event must end after it starts.';
  if (isNew && f.startsAt < Date.now()) e.startsAt = 'The start time is in the past.';
  if (f.mode !== 'AUTO_ASSIGN') {
    if (!f.regOpensAt || !f.regClosesAt || f.regClosesAt <= f.regOpensAt) e.regClosesAt = 'Registration must close after it opens.';
    else if (f.regClosesAt > f.startsAt) e.regClosesAt = 'Registration should close before the event starts.';
  }
  if (!f.capacity || f.capacity < 1) e.capacity = 'Capacity must be at least 1.';
  const venue = byId(s.locations, f.venueId);
  if (venue?.capacity && f.capacity > venue.capacity) w.capacity = `${venue.name} holds about ${venue.capacity} people.`;
  const eligible = countEligibleStudents(s.users, f.eligibility);
  if (!eligible && !f.allowOutsiders) e.eligibility = 'No student matches these rules. Widen them or allow guests.';
  if (!f.gateIds.length) w.gateIds = 'Without gates, passes cannot be scanned. Add at least one before the event.';
  const unstaffed = f.gateIds.filter((g) => !(f.assignments[g] || []).length);
  if (f.gateIds.length && unstaffed.length) w.assignments = `${unstaffed.length} gate(s) have no security staff yet.`;
  return { e, w, eligible };
}

const STEP_FIELDS = [['title', 'description'], ['venueId', 'startsAt', 'endsAt', 'regClosesAt'], ['capacity'], ['eligibility'], [], []];

function ChipToggle({ options, value, onChange, render = (x) => x, label }) {
  const toggle = (o) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div className="d-flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" className="toggle-chip" aria-pressed={value.includes(o)} onClick={() => toggle(o)}>{render(o)}</button>
      ))}
    </div>
  );
}

export default function EventForm() {
  const { id } = useParams();
  const s = useStore();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const existing = id ? byId(s.events, id) : null;
  useTitle(existing ? `Edit ${existing.title}` : 'Create event');

  const [f, setF] = useState(() => {
    if (!existing) return { ...defaults(), organizerIds: user.role === 'ORGANIZER' ? [user.id] : [] };
    const assignments = {};
    s.assignments.filter((a) => a.eventId === existing.id).forEach((a) => { (assignments[a.gateId] ||= []).push(a.userId); });
    return { ...structuredClone(existing), assignments };
  });
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState(new Set());
  const { e: errors, w: warnings, eligible } = useMemo(() => validate(f, s, !existing), [f, s, existing]);

  if (id && (!existing || !canManage(user, existing))) {
    return <EmptyState icon="calendar-x" title="Event not found" action={<Button as={Link} to="/manage/events">Back to events</Button>}>You may not have permission to edit it.</EmptyState>;
  }
  if (existing && ['COMPLETED', 'CANCELLED'].includes(existing.status)) {
    return <EmptyState icon="lock" title="This event can no longer be edited" action={<Button as={Link} to={`/manage/events/${existing.id}`}>Back to event</Button>}>Completed and cancelled events are locked so reports stay accurate.</EmptyState>;
  }

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setElig = (k, v) => setF((x) => ({ ...x, eligibility: { ...x.eligibility, [k]: v } }));
  const venue = byId(s.locations, f.venueId);
  const venueGates = f.venueId ? gatesForLocation(s, f.venueId) : [];
  const security = s.users.filter((u) => u.role === 'SECURITY' && u.status === 'ACTIVE');
  const organizers = s.users.filter((u) => u.role === 'ORGANIZER' && u.status === 'ACTIVE');
  const stepErrors = (i) => STEP_FIELDS[i].filter((k) => errors[k]);
  const show = (k) => (touched.has(step) || touched.has('all')) && errors[k];

  const next = () => {
    setTouched((t) => new Set(t).add(step));
    if (stepErrors(step).length) return;
    setStep((x) => Math.min(x + 1, STEPS.length - 1));
  };
  const submit = (publish) => {
    setTouched(new Set(['all', 0, 1, 2, 3, 4, 5]));
    const firstBad = STEPS.findIndex((_, i) => stepErrors(i).length);
    if (firstBad >= 0) {
      setStep(firstBad);
      return toast.error('Fix the highlighted fields first.');
    }
    if (publish && !f.gateIds.length) {
      setStep(4);
      return toast.error('Add at least one entry gate before publishing.');
    }
    const { assignments, ...rest } = f;
    const data = { ...rest, assignments, title: f.title.trim(), description: f.description.trim(), capacity: Number(f.capacity) };
    if (f.mode === 'AUTO_ASSIGN') { data.regOpensAt = Date.now(); data.regClosesAt = f.startsAt; }
    const r = saveEvent(data, { id: existing?.id, publish });
    toast.result(r);
    if (r.ok) navigate(`/manage/events/${r.id}`);
  };
  const changeVenue = (vid) => setF((x) => ({ ...x, venueId: vid, gateIds: gatesForLocation(s, vid).map((g) => g.id).slice(0, 1), assignments: {} }));

  return (
    <>
      <PageHeader
        title={existing ? 'Edit event' : 'Create event'}
        crumbs={[{ label: user.role === 'ADMIN' ? 'All events' : 'My events', to: '/manage/events' }]}
        subtitle={existing ? existing.title : 'Six short steps. You can save a draft at any point and publish later.'}
      />
      <ol className="stepper" aria-label="Steps">
        {STEPS.map((label, i) => {
          const bad = touched.has(i) && stepErrors(i).length;
          return (
            <li key={label} className={i === step ? 'active' : bad ? 'error' : i < step ? 'done' : ''}>
              <button type="button" onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined}>
                <span className="step-num">{bad ? '!' : i < step ? <i className="bi bi-check" /> : i + 1}</span>{label}
              </button>
            </li>
          );
        })}
      </ol>

      <Row className="g-3">
        <Col lg={8}>
          <Panel title={`${step + 1}. ${STEPS[step]}`}>
            <Form noValidate onSubmit={(e) => { e.preventDefault(); next(); }}>
              {step === 0 && (
                <Row className="g-3">
                  <Col xs={12}>
                    <Form.Group controlId="ef-title"><Form.Label>Event title</Form.Label>
                      <Form.Control value={f.title} onChange={(e) => set('title', e.target.value)} isInvalid={!!show('title')} maxLength={90} placeholder="e.g. Cloud Computing Workshop" autoFocus />
                      <Form.Control.Feedback type="invalid">{errors.title}</Form.Control.Feedback>
                      <Form.Text>{f.title.length}/90</Form.Text>
                    </Form.Group>
                  </Col>
                  <Col xs={12}>
                    <Form.Label as="div">Category</Form.Label>
                    <Row className="g-2">
                      {Object.entries(CATEGORIES).map(([k, c]) => (
                        <Col xs={6} md={4} key={k}>
                          <button type="button" className={`choice-card ${f.category === k ? 'selected' : ''}`} onClick={() => set('category', k)} aria-pressed={f.category === k}>
                            <i className={`bi bi-${c.icon}`} style={{ color: c.color }} aria-hidden="true" /><span className="fw-600">{c.label}</span>
                          </button>
                        </Col>
                      ))}
                    </Row>
                  </Col>
                  <Col xs={12}>
                    <Form.Group controlId="ef-desc"><Form.Label>Description</Form.Label>
                      <Form.Control as="textarea" rows={5} value={f.description} onChange={(e) => set('description', e.target.value)} isInvalid={!!show('description')} placeholder="What happens, who it's for, what to bring." />
                      <Form.Control.Feedback type="invalid">{errors.description}</Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  {user.role === 'ADMIN' && (
                    <Col xs={12}>
                      <Form.Label as="div">Organizers</Form.Label>
                      <ChipToggle label="Organizers" options={organizers.map((o) => o.id)} value={f.organizerIds} onChange={(v) => set('organizerIds', v)} render={(oid) => byId(s.users, oid)?.name} />
                      <Form.Text>Organizers can manage registrations and see analytics for this event.</Form.Text>
                    </Col>
                  )}
                </Row>
              )}

              {step === 1 && (
                <Row className="g-3">
                  <Col md={6}>
                    <Form.Group controlId="ef-venue"><Form.Label>Venue</Form.Label>
                      <Form.Select value={f.venueId} onChange={(e) => changeVenue(e.target.value)} isInvalid={!!show('venueId')}>
                        <option value="">Choose a campus venue…</option>
                        {Object.entries(LOCATION_TYPES).map(([t, meta]) => {
                          const opts = s.locations.filter((l) => l.type === t && l.canHostEvents);
                          return opts.length ? (
                            <optgroup key={t} label={meta.label}>
                              {opts.map((l) => <option key={l.id} value={l.id}>{l.name}{l.capacity ? ` (≈${l.capacity})` : ''}</option>)}
                            </optgroup>
                          ) : null;
                        })}
                      </Form.Select>
                      <Form.Control.Feedback type="invalid">{errors.venueId}</Form.Control.Feedback>
                    </Form.Group>
                    {venue && <p className="small text-muted-2 mt-2 mb-0">{venue.building} · {venue.description}</p>}
                  </Col>
                  <Col md={6}>{venue ? <CampusMap locations={[venue]} selectedId={venue.id} height={170} zoom={17} /> : <div className="border rounded h-100 d-grid text-muted-2 small p-3" style={{ placeItems: 'center' }}>Map preview</div>}</Col>
                  <Col md={6}>
                    <Form.Group controlId="ef-start"><Form.Label>Starts</Form.Label>
                      <Form.Control type="datetime-local" value={toInputDT(f.startsAt)} onChange={(e) => set('startsAt', fromInputDT(e.target.value))} isInvalid={!!show('startsAt')} />
                      <Form.Control.Feedback type="invalid">{errors.startsAt}</Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group controlId="ef-end"><Form.Label>Ends</Form.Label>
                      <Form.Control type="datetime-local" value={toInputDT(f.endsAt)} onChange={(e) => set('endsAt', fromInputDT(e.target.value))} isInvalid={!!show('endsAt')} />
                      <Form.Control.Feedback type="invalid">{errors.endsAt}</Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  {f.mode !== 'AUTO_ASSIGN' && (
                    <>
                      <Col md={6}>
                        <Form.Group controlId="ef-ro"><Form.Label>Registration opens</Form.Label>
                          <Form.Control type="datetime-local" value={toInputDT(f.regOpensAt)} onChange={(e) => set('regOpensAt', fromInputDT(e.target.value))} />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group controlId="ef-rc"><Form.Label>Registration closes</Form.Label>
                          <Form.Control type="datetime-local" value={toInputDT(f.regClosesAt)} onChange={(e) => set('regClosesAt', fromInputDT(e.target.value))} isInvalid={!!show('regClosesAt')} />
                          <Form.Control.Feedback type="invalid">{errors.regClosesAt}</Form.Control.Feedback>
                        </Form.Group>
                      </Col>
                    </>
                  )}
                  <Col xs={12}><Alert variant="light" className="border small mb-0"><i className="bi bi-door-open me-1" />Gates open automatically 60 minutes before the start time.</Alert></Col>
                </Row>
              )}

              {step === 2 && (
                <Row className="g-3">
                  <Col xs={12}>
                    <Form.Label as="div">How do people get a seat?</Form.Label>
                    <Row className="g-2">
                      {Object.entries(MODES).map(([k, m]) => (
                        <Col md={4} key={k}>
                          <button type="button" className={`choice-card ${f.mode === k ? 'selected' : ''}`} onClick={() => set('mode', k)} aria-pressed={f.mode === k}>
                            <i className={`bi bi-${m.icon}`} aria-hidden="true" />
                            <span><span className="fw-600 d-block">{m.label}</span><span className="small-2 text-muted-2">{m.desc}</span></span>
                          </button>
                        </Col>
                      ))}
                    </Row>
                  </Col>
                  <Col md={6}>
                    <Form.Group controlId="ef-cap"><Form.Label>Capacity (seats)</Form.Label>
                      <Form.Control type="number" min={1} value={f.capacity} onChange={(e) => set('capacity', e.target.value === '' ? '' : Number(e.target.value))} isInvalid={!!show('capacity')} />
                      <Form.Control.Feedback type="invalid">{errors.capacity}</Form.Control.Feedback>
                      {warnings.capacity && <Form.Text className="text-warning"><i className="bi bi-exclamation-triangle me-1" />{warnings.capacity}</Form.Text>}
                    </Form.Group>
                  </Col>
                  <Col md={6} className="d-flex align-items-end">
                    <Form.Check type="switch" id="ef-out" checked={f.allowOutsiders} onChange={(e) => set('allowOutsiders', e.target.checked)} disabled={f.mode === 'AUTO_ASSIGN'}
                      label={<><span className="fw-600">Allow guests from other institutions</span><span className="d-block small-2 text-muted-2">Verified guest accounts can register.</span></>} />
                  </Col>
                </Row>
              )}

              {step === 3 && (
                <div className="section-gap">
                  <p className="small text-muted-2 mb-0">Leave a group empty to allow everyone. Students outside these rules won't see a Register button and are told why.</p>
                  <div>
                    <Form.Label as="div">Departments</Form.Label>
                    <ChipToggle label="Departments" options={s.departments.map((d) => d.id)} value={f.eligibility.departments} onChange={(v) => setElig('departments', v)} />
                  </div>
                  <div>
                    <Form.Label as="div">Semesters</Form.Label>
                    <ChipToggle label="Semesters" options={SEMESTERS} value={f.eligibility.semesters} onChange={(v) => setElig('semesters', v)} render={(x) => `Sem ${x}`} />
                  </div>
                  <div>
                    <Form.Label as="div">Sections</Form.Label>
                    <ChipToggle label="Sections" options={SECTIONS} value={f.eligibility.sections} onChange={(v) => setElig('sections', v)} />
                  </div>
                  <Alert variant={eligible ? 'success' : 'danger'} className="small mb-0" aria-live="polite">
                    <i className={`bi bi-${eligible ? 'people' : 'exclamation-octagon'} me-2`} />
                    <strong>{eligible}</strong> enrolled student{eligible === 1 ? '' : 's'} match these rules{f.allowOutsiders ? ', plus verified guests' : ''}.
                    {!eligible && !f.allowOutsiders && ' Widen the rules or allow guests.'}
                  </Alert>
                </div>
              )}

              {step === 4 && (
                <div className="section-gap">
                  {!venue ? <Alert variant="warning" className="small">Choose a venue first (step 2).</Alert> : !venueGates.length ? (
                    <Alert variant="warning" className="small">{venue.name} has no gates yet. An admin can add them under Campus → Locations &amp; Gates.</Alert>
                  ) : (
                    venueGates.map((g) => {
                      const on = f.gateIds.includes(g.id);
                      const staff = f.assignments[g.id] || [];
                      return (
                        <div key={g.id} className={`border rounded p-3 ${on ? 'bg-white' : 'bg-light'}`}>
                          <Form.Check type="switch" id={`gate-${g.id}`} checked={on} label={<span className="fw-600">{g.name}</span>}
                            onChange={(e) => setF((x) => ({ ...x, gateIds: e.target.checked ? [...x.gateIds, g.id] : x.gateIds.filter((y) => y !== g.id) }))} />
                          {on && (
                            <div className="mt-2">
                              <div className="small fw-600 mb-1">Security staff at this gate</div>
                              <ChipToggle label={`Staff for ${g.name}`} options={security.map((u) => u.id)} value={staff} render={(uid) => byId(s.users, uid)?.name}
                                onChange={(v) => setF((x) => ({ ...x, assignments: { ...x.assignments, [g.id]: v } }))} />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  {warnings.gateIds && <Alert variant="warning" className="small mb-0"><i className="bi bi-exclamation-triangle me-1" />{warnings.gateIds}</Alert>}
                  {!warnings.gateIds && warnings.assignments && <Alert variant="warning" className="small mb-0"><i className="bi bi-exclamation-triangle me-1" />{warnings.assignments}</Alert>}
                </div>
              )}

              {step === 5 && (
                <div className="section-gap">
                  <dl className="pass-facts" style={{ fontSize: '.92rem' }}>
                    <dt>Title</dt><dd>{f.title || <em className="text-danger">missing</em>}</dd>
                    <dt>Category</dt><dd>{CATEGORIES[f.category].label}</dd>
                    <dt>When</dt><dd>{f.startsAt && f.endsAt ? fmtRange(f.startsAt, f.endsAt) : '—'}</dd>
                    <dt>Venue</dt><dd>{venue?.name || <em className="text-danger">missing</em>}</dd>
                    <dt>Registration</dt><dd>{MODES[f.mode].label}{f.mode !== 'AUTO_ASSIGN' && ` · ${fmtDateTime(f.regOpensAt)} → ${fmtDateTime(f.regClosesAt)}`}</dd>
                    <dt>Capacity</dt><dd>{f.capacity} seats</dd>
                    <dt>Who</dt><dd>{eligibilitySummary(f)} · {eligible} students</dd>
                    <dt>Gates</dt><dd>{f.gateIds.map((g) => `${byId(s.gates, g)?.name} (${(f.assignments[g] || []).length} staff)`).join(', ') || 'None'}</dd>
                  </dl>
                  {Object.keys(errors).length > 0 && (
                    <Alert variant="danger" className="small mb-0"><strong>Fix before saving:</strong><ul className="mb-0">{Object.values(errors).map((m) => <li key={m}>{m}</li>)}</ul></Alert>
                  )}
                  {Object.keys(warnings).length > 0 && (
                    <Alert variant="warning" className="small mb-0"><strong>Worth checking:</strong><ul className="mb-0">{Object.values(warnings).map((m) => <li key={m}>{m}</li>)}</ul></Alert>
                  )}
                </div>
              )}

              <div className="d-flex flex-wrap gap-2 justify-content-between mt-4 pt-3 border-top">
                <Button variant="light" onClick={() => setStep((x) => Math.max(0, x - 1))} disabled={step === 0}><i className="bi bi-arrow-left me-1" />Back</Button>
                <div className="d-flex flex-wrap gap-2">
                  {(!existing || existing.status === 'DRAFT') && <Button variant="outline-primary" onClick={() => submit(false)}>Save draft</Button>}
                  {step < STEPS.length - 1 ? (
                    <Button type="submit">Next<i className="bi bi-arrow-right ms-1" /></Button>
                  ) : existing && existing.status !== 'DRAFT' ? (
                    <Button variant="brand" onClick={() => submit(false)}>Save changes</Button>
                  ) : (
                    <Button variant="brand" onClick={() => submit(true)}><i className="bi bi-broadcast me-1" />Publish event</Button>
                  )}
                </div>
              </div>
            </Form>
          </Panel>
        </Col>
        <Col lg={4}>
          <div className="sticky-lg">
            <Panel title="Live preview" icon="eye">
              <div className="event-band rounded mb-2" style={{ '--cat': CATEGORIES[f.category].color }}>
                <div className="date-block"><span className="dm">{f.startsAt ? new Date(f.startsAt).toLocaleDateString('en-IN', { month: 'short' }) : '—'}</span><span className="dd">{f.startsAt ? new Date(f.startsAt).getDate() : '–'}</span></div>
                <span className="cat-chip"><i className={`bi bi-${CATEGORIES[f.category].icon} me-1`} />{CATEGORIES[f.category].label}</span>
              </div>
              <div className="fw-bold">{f.title || 'Event title'}</div>
              <div className="event-meta mt-1"><i className="bi bi-clock" />{f.startsAt && f.endsAt > f.startsAt ? fmtRange(f.startsAt, f.endsAt) : 'Date & time'}</div>
              <div className="event-meta"><i className="bi bi-geo-alt" />{venue?.name || 'Venue'}</div>
              <div className="d-flex flex-wrap gap-1 mt-2">
                <Tag tone="primary" icon={MODES[f.mode].icon}>{MODES[f.mode].short}</Tag>
                {f.allowOutsiders && <Tag tone="info" icon="globe2">Guests welcome</Tag>}
                <Tag icon="people">{f.capacity || 0} seats</Tag>
              </div>
              <p className="small-2 text-muted-2 mt-2 mb-0">{eligibilitySummary(f)}</p>
            </Panel>
          </div>
        </Col>
      </Row>
    </>
  );
}
