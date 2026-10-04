import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Col, Form, Row } from 'react-bootstrap';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useApi } from '../../api/useApi';
import { CATEGORIES, MODES, SECTIONS, SEMESTERS, VENUE_TYPES } from '../../data/constants';
import { useCurrentUser } from '../../auth/AuthContext';
import { eligibilitySummary } from '../../utils/events';
import { fmtDateTime, fmtRange, fromInputDT, toInputDT } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { EmptyState, Loading, PageHeader, Panel, Tag } from '../../components/ui';
import { toast } from '../../components/feedback';

const STEPS = ['Basics', 'Venue & schedule', 'Registration', 'Eligibility', 'Gates & security', 'Review'];
/** Which wizard step owns each field, so server-side errors take the user to the right place. */
const FIELD_STEP = { title: 0, description: 0, category: 0, organizerIds: 0, venueId: 1, startsAt: 1, endsAt: 1, regOpensAt: 1, regClosesAt: 1, capacity: 2, mode: 2, eligibility: 3, gateIds: 4 };

function defaults() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(10, 0, 0, 0);
  const start = d.getTime();
  return {
    title: '', category: 'TECHNICAL', description: '', venueId: '', startsAt: start, endsAt: start + 3 * 36e5,
    regOpensAt: Date.now(), regClosesAt: start - 864e5, capacity: 100, mode: 'OPEN', allowOutsiders: false,
    eligibility: { departments: [], semesters: [], sections: [] }, gateIds: [], gateStaff: {}, organizerIds: [],
  };
}

function fromView(ev) {
  const gateStaff = {};
  (ev.gateStaff || []).forEach((g) => { gateStaff[g.gateId] = g.staff.map((s) => s.id); });
  return {
    title: ev.title, category: ev.category, description: ev.description, venueId: ev.venue.id, startsAt: ev.startsAt, endsAt: ev.endsAt,
    regOpensAt: ev.regOpensAt, regClosesAt: ev.regClosesAt, capacity: ev.stats.capacity, mode: ev.mode, allowOutsiders: ev.allowOutsiders,
    eligibility: ev.eligibility, gateIds: ev.gates.map((g) => g.id), gateStaff, organizerIds: ev.organizers.map((o) => o.id),
  };
}

/** Same rules as the server, so most mistakes are caught before submitting. */
function validate(f, venue, isNew, status) {
  const e = {};
  const w = {};
  if (f.title.trim().length < 5) e.title = 'Give the event a title of at least 5 characters.';
  if (f.description.trim().length < 20) e.description = 'Describe the event in at least 20 characters.';
  if (!f.venueId) e.venueId = 'Choose a venue.';
  if (!f.startsAt || !f.endsAt || f.endsAt <= f.startsAt) e.endsAt = 'The event must end after it starts.';
  if ((isNew || status === 'DRAFT') && f.startsAt < Date.now()) e.startsAt = 'The start time is in the past.';
  if (f.mode !== 'AUTO_ASSIGN') {
    if (!f.regOpensAt || !f.regClosesAt || f.regClosesAt <= f.regOpensAt) e.regClosesAt = 'Registration must close after it opens.';
    else if (f.regClosesAt > f.startsAt) e.regClosesAt = 'Registration should close before the event starts.';
  }
  if (!f.capacity || f.capacity < 1) e.capacity = 'Capacity must be at least 1.';
  if (venue?.capacity && f.capacity > venue.capacity) w.capacity = `${venue.name} holds about ${venue.capacity} people.`;
  if (!f.gateIds.length) w.gateIds = 'Add at least one entry gate before publishing — otherwise passes can’t be scanned.';
  const unstaffed = f.gateIds.filter((g) => !(f.gateStaff[g] || []).length);
  if (f.gateIds.length && unstaffed.length) w.gateStaff = `${unstaffed.length} gate(s) have no security staff yet.`;
  return { e, w };
}

function ChipToggle({ options, value, onChange, label }) {
  const toggle = (o) => onChange(value.includes(o.value) ? value.filter((x) => x !== o.value) : [...value, o.value]);
  return (
    <div className="d-flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((o) => <button key={o.value} type="button" className="toggle-chip" aria-pressed={value.includes(o.value)} onClick={() => toggle(o)}>{o.label}</button>)}
    </div>
  );
}

export default function EventForm() {
  const { id } = useParams();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const existing = useApi(id ? `/manage/events/${id}` : null);
  const venues = useApi('/manage/venues');
  const depts = useApi('/departments');
  const security = useApi('/manage/security-staff');
  const organizers = useApi(user.role === 'ADMIN' ? '/manage/organizers' : null);
  useTitle(id ? 'Edit event' : 'Create event');

  const [f, setF] = useState(null);
  const [step, setStep] = useState(0);
  const [touched, setTouched] = useState(new Set());
  const [serverErrors, setServerErrors] = useState({});
  const [eligibleCount, setEligibleCount] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) setF(defaults());
    else if (existing.data) setF(fromView(existing.data));
  }, [id, existing.data]);

  const eligKey = JSON.stringify(f?.eligibility);
  useEffect(() => {
    if (!f) return undefined;
    const t = setTimeout(() => {
      api('/manage/eligibility-preview', { method: 'POST', body: f.eligibility }).then((r) => setEligibleCount(r.count)).catch(() => setEligibleCount(null));
    }, 300);
    return () => clearTimeout(t);
  }, [eligKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const venue = useMemo(() => (venues.data || []).find((v) => v.id === Number(f?.venueId)), [venues.data, f?.venueId]);
  const status = existing.data?.status;
  const { e: clientErrors, w: warnings } = useMemo(() => (f ? validate(f, venue, !id, status) : { e: {}, w: {} }), [f, venue, id, status]);
  const errors = { ...clientErrors, ...serverErrors };

  if (id && existing.error) return <EmptyState icon="calendar-x" title="Event not found" action={<Button as={Link} to="/manage/events">Back to events</Button>}>{existing.error.message}</EmptyState>;
  if (!f || !venues.data || !depts.data) return <Loading />;
  if (status && ['COMPLETED', 'CANCELLED'].includes(status)) {
    return <EmptyState icon="lock" title="This event can no longer be edited" action={<Button as={Link} to={`/manage/events/${id}`}>Back to event</Button>}>Completed and cancelled events are locked so records stay accurate.</EmptyState>;
  }

  const set = (k, v) => {
    setServerErrors((s) => { const n = { ...s }; delete n[k]; return n; });
    setF((x) => ({ ...x, [k]: v }));
  };
  const setElig = (k, v) => set('eligibility', { ...f.eligibility, [k]: v });
  const stepErrors = (i) => Object.keys(errors).filter((k) => FIELD_STEP[k] === i);
  const show = (k) => (touched.has(step) || touched.has('all') || serverErrors[k]) && errors[k];
  const changeVenue = (vid) => {
    const v = venues.data.find((x) => x.id === Number(vid));
    setF((x) => ({ ...x, venueId: vid ? Number(vid) : '', gateIds: v?.gates.slice(0, 1).map((g) => g.id) || [], gateStaff: {} }));
  };

  const next = () => {
    setTouched((t) => new Set(t).add(step));
    if (stepErrors(step).length) return;
    setStep((x) => Math.min(x + 1, STEPS.length - 1));
  };

  const submit = async (publish) => {
    setTouched(new Set(['all', 0, 1, 2, 3, 4, 5]));
    const firstBad = STEPS.findIndex((_, i) => stepErrors(i).length);
    if (firstBad >= 0) {
      setStep(firstBad);
      toast.error('Fix the highlighted fields first.');
      return;
    }
    const body = {
      ...f, title: f.title.trim(), description: f.description.trim(), venueId: Number(f.venueId), capacity: Number(f.capacity),
      regOpensAt: f.mode === 'AUTO_ASSIGN' ? null : f.regOpensAt, regClosesAt: f.mode === 'AUTO_ASSIGN' ? null : f.regClosesAt,
      organizerIds: user.role === 'ADMIN' ? f.organizerIds : null,
    };
    setSaving(true);
    try {
      let saved;
      if (id) {
        saved = await api(`/manage/events/${id}`, { method: 'PUT', body });
        if (publish && saved.status === 'DRAFT') saved = await api(`/manage/events/${id}/publish`, { method: 'POST' });
      } else {
        saved = await api(`/manage/events?publish=${publish}`, { method: 'POST', body });
      }
      toast.success(publish ? 'Event published.' : id ? 'Changes saved.' : 'Saved as a draft.');
      navigate(`/manage/events/${saved.id}`);
    } catch (err) {
      setServerErrors(err.errors || {});
      const bad = Object.keys(err.errors || {}).map((k) => FIELD_STEP[k]).filter((x) => x !== undefined);
      if (bad.length) setStep(Math.min(...bad));
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deptOptions = depts.data.map((d) => ({ value: d.code, label: d.code }));

  return (
    <>
      <PageHeader title={id ? 'Edit event' : 'Create event'} crumbs={[{ label: user.role === 'ADMIN' ? 'All events' : 'My events', to: '/manage/events' }]}
        subtitle={id ? existing.data?.title : 'Six short steps. Save a draft at any point and publish when ready.'} />
      <ol className="stepper" aria-label="Steps">
        {STEPS.map((label, i) => {
          const bad = (touched.has(i) || touched.has('all')) && stepErrors(i).length;
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
                      <Form.Control value={f.title} onChange={(e) => set('title', e.target.value)} isInvalid={!!show('title')} maxLength={120} placeholder="e.g. Cloud Computing Workshop" autoFocus />
                      <Form.Control.Feedback type="invalid">{errors.title}</Form.Control.Feedback>
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
                      <Form.Control as="textarea" rows={5} value={f.description} onChange={(e) => set('description', e.target.value)} isInvalid={!!show('description')} maxLength={4000} placeholder="What happens, who it's for, what to bring." />
                      <Form.Control.Feedback type="invalid">{errors.description}</Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  {user.role === 'ADMIN' && organizers.data && (
                    <Col xs={12}>
                      <Form.Label as="div">Organizers</Form.Label>
                      <ChipToggle label="Organizers" options={organizers.data.map((o) => ({ value: o.id, label: o.name }))} value={f.organizerIds} onChange={(v) => set('organizerIds', v)} />
                      <Form.Text>Organizers manage registrations for this event. Leave empty to manage it yourself.</Form.Text>
                      {errors.organizerIds && <div className="small text-danger">{errors.organizerIds}</div>}
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
                        {Object.entries(VENUE_TYPES).map(([t, meta]) => {
                          const opts = venues.data.filter((v) => v.type === t);
                          return opts.length ? <optgroup key={t} label={meta.label}>{opts.map((v) => <option key={v.id} value={v.id}>{v.name}{v.capacity ? ` (≈${v.capacity})` : ''}</option>)}</optgroup> : null;
                        })}
                      </Form.Select>
                      <Form.Control.Feedback type="invalid">{errors.venueId}</Form.Control.Feedback>
                    </Form.Group>
                  </Col>
                  <Col md={6} className="small text-muted-2 d-flex align-items-end">{venue && <span>{venue.building}{venue.floor && venue.floor !== '—' ? ` · Floor ${venue.floor}` : ''} · {venue.gates.length} gate(s)</span>}</Col>
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
                  <Col xs={12}><Alert variant="light" className="border small mb-0"><i className="bi bi-door-open me-1" />Gates open 60 minutes before the start. Publishing is blocked if another event uses this venue at an overlapping time.</Alert></Col>
                </Row>
              )}

              {step === 2 && (
                <Row className="g-3">
                  <Col xs={12}>
                    <Form.Label as="div">How do students get a seat?</Form.Label>
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
                    {errors.mode && <div className="small text-danger mt-1">{errors.mode}</div>}
                  </Col>
                  <Col md={6}>
                    <Form.Group controlId="ef-cap"><Form.Label>Capacity (seats)</Form.Label>
                      <Form.Control type="number" min={1} value={f.capacity} onChange={(e) => set('capacity', e.target.value === '' ? '' : Number(e.target.value))} isInvalid={!!show('capacity')} />
                      <Form.Control.Feedback type="invalid">{errors.capacity}</Form.Control.Feedback>
                      {warnings.capacity && <Form.Text className="text-warning"><i className="bi bi-exclamation-triangle me-1" />{warnings.capacity}</Form.Text>}
                    </Form.Group>
                  </Col>
                </Row>
              )}

              {step === 3 && (
                <div className="section-gap">
                  <p className="small text-muted-2 mb-0">Leave a group empty to allow everyone. The server checks these rules on every registration; students who don't qualify see exactly why.</p>
                  <div><Form.Label as="div">Departments</Form.Label><ChipToggle label="Departments" options={deptOptions} value={f.eligibility.departments} onChange={(v) => setElig('departments', v)} /></div>
                  <div><Form.Label as="div">Semesters</Form.Label><ChipToggle label="Semesters" options={SEMESTERS.map((s) => ({ value: s, label: `Sem ${s}` }))} value={f.eligibility.semesters} onChange={(v) => setElig('semesters', v)} /></div>
                  <div><Form.Label as="div">Sections</Form.Label><ChipToggle label="Sections" options={SECTIONS.map((s) => ({ value: s, label: s }))} value={f.eligibility.sections} onChange={(v) => setElig('sections', v)} /></div>
                  {errors.eligibility && <Alert variant="danger" className="small mb-0">{errors.eligibility}</Alert>}
                  <Alert variant={eligibleCount === 0 ? 'warning' : 'success'} className="small mb-0" aria-live="polite">
                    <i className="bi bi-people me-2" />
                    {eligibleCount == null ? 'Counting matching students…' : <><strong>{eligibleCount}</strong> enrolled student{eligibleCount === 1 ? '' : 's'} match these rules.</>}
                  </Alert>
                </div>
              )}

              {step === 4 && (
                <div className="section-gap">
                  {!venue ? <Alert variant="warning" className="small">Choose a venue first (step 2).</Alert> : !venue.gates.length ? (
                    <Alert variant="warning" className="small">{venue.name} has no gates yet. An admin can add them under Control Panel → Venues &amp; Gates.</Alert>
                  ) : venue.gates.map((g) => {
                    const on = f.gateIds.includes(g.id);
                    const staff = f.gateStaff[g.id] || [];
                    return (
                      <div key={g.id} className={`border rounded p-3 ${on ? 'bg-white' : 'bg-light'}`}>
                        <Form.Check type="switch" id={`gate-${g.id}`} checked={on} label={<span className="fw-600">{g.name}</span>}
                          onChange={(e) => set('gateIds', e.target.checked ? [...f.gateIds, g.id] : f.gateIds.filter((y) => y !== g.id))} />
                        {on && security.data && (
                          <div className="mt-2">
                            <div className="small fw-600 mb-1">Security staff allowed to scan here</div>
                            <ChipToggle label={`Staff for ${g.name}`} options={security.data.map((u) => ({ value: u.id, label: u.name }))} value={staff}
                              onChange={(v) => set('gateStaff', { ...f.gateStaff, [g.id]: v })} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {errors.gateIds && <Alert variant="danger" className="small mb-0">{errors.gateIds}</Alert>}
                  {warnings.gateIds && <Alert variant="warning" className="small mb-0"><i className="bi bi-exclamation-triangle me-1" />{warnings.gateIds}</Alert>}
                  {!warnings.gateIds && warnings.gateStaff && <Alert variant="warning" className="small mb-0"><i className="bi bi-exclamation-triangle me-1" />{warnings.gateStaff}</Alert>}
                </div>
              )}

              {step === 5 && (
                <div className="section-gap">
                  <dl className="pass-facts" style={{ fontSize: '.92rem' }}>
                    <dt>Title</dt><dd>{f.title || <em className="text-danger">missing</em>}</dd>
                    <dt>Category</dt><dd>{CATEGORIES[f.category].label}</dd>
                    <dt>When</dt><dd>{f.startsAt && f.endsAt > f.startsAt ? fmtRange(f.startsAt, f.endsAt) : '—'}</dd>
                    <dt>Venue</dt><dd>{venue?.name || <em className="text-danger">missing</em>}</dd>
                    <dt>Registration</dt><dd>{MODES[f.mode].label}{f.mode !== 'AUTO_ASSIGN' && ` · ${fmtDateTime(f.regOpensAt)} → ${fmtDateTime(f.regClosesAt)}`}</dd>
                    <dt>Capacity</dt><dd>{f.capacity} seats</dd>
                    <dt>Who</dt><dd>{eligibilitySummary(f.eligibility)}{eligibleCount != null && ` · ${eligibleCount} students`}</dd>
                    <dt>Gates</dt><dd>{f.gateIds.map((gid) => `${venue?.gates.find((g) => g.id === gid)?.name} (${(f.gateStaff[gid] || []).length} staff)`).join(', ') || 'None'}</dd>
                  </dl>
                  {Object.keys(errors).length > 0 && <Alert variant="danger" className="small mb-0"><strong>Fix before saving:</strong><ul className="mb-0">{Object.values(errors).map((m) => <li key={m}>{m}</li>)}</ul></Alert>}
                  {Object.keys(warnings).length > 0 && <Alert variant="warning" className="small mb-0"><strong>Worth checking:</strong><ul className="mb-0">{Object.values(warnings).map((m) => <li key={m}>{m}</li>)}</ul></Alert>}
                </div>
              )}

              <div className="d-flex flex-wrap gap-2 justify-content-between mt-4 pt-3 border-top">
                <Button variant="light" onClick={() => setStep((x) => Math.max(0, x - 1))} disabled={step === 0}><i className="bi bi-arrow-left me-1" />Back</Button>
                <div className="d-flex flex-wrap gap-2">
                  {(!id || status === 'DRAFT') && <Button variant="outline-primary" onClick={() => submit(false)} disabled={saving}>Save draft</Button>}
                  {step < STEPS.length - 1 ? <Button type="submit">Next<i className="bi bi-arrow-right ms-1" /></Button>
                    : id && status !== 'DRAFT' ? <Button variant="brand" onClick={() => submit(false)} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
                      : <Button variant="brand" onClick={() => submit(true)} disabled={saving}><i className="bi bi-broadcast me-1" />{saving ? 'Publishing…' : 'Publish event'}</Button>}
                </div>
              </div>
            </Form>
          </Panel>
        </Col>
        <Col lg={4}>
          <div className="sticky-lg">
            <Panel title="Preview" icon="eye">
              <div className="event-band rounded mb-2" style={{ '--cat': CATEGORIES[f.category].color }}>
                <div className="date-block"><span className="dm">{new Date(f.startsAt || Date.now()).toLocaleDateString('en-IN', { month: 'short' })}</span><span className="dd">{new Date(f.startsAt || Date.now()).getDate()}</span></div>
                <span className="cat-chip"><i className={`bi bi-${CATEGORIES[f.category].icon} me-1`} />{CATEGORIES[f.category].label}</span>
              </div>
              <div className="fw-bold">{f.title || 'Event title'}</div>
              <div className="event-meta mt-1"><i className="bi bi-clock" />{f.startsAt && f.endsAt > f.startsAt ? fmtRange(f.startsAt, f.endsAt) : 'Date & time'}</div>
              <div className="event-meta"><i className="bi bi-geo-alt" />{venue?.name || 'Venue'}</div>
              <div className="d-flex flex-wrap gap-1 mt-2">
                <Tag tone="primary" icon={MODES[f.mode].icon}>{MODES[f.mode].short}</Tag>
                <Tag icon="people">{f.capacity || 0} seats</Tag>
              </div>
              <p className="small-2 text-muted-2 mt-2 mb-0">{eligibilitySummary(f.eligibility)}</p>
            </Panel>
          </div>
        </Col>
      </Row>
    </>
  );
}
