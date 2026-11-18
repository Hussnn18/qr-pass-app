import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Col, Dropdown, Form, Modal, Nav, ProgressBar, Row, Table } from 'react-bootstrap';
import { api, download, qs, subscribe } from '../../api/client';
import { useApi } from '../../api/useApi';
import { ENTRY_METHODS, SCAN_RESULTS } from '../../data/constants';
import { fmtDateTime, fmtTime, fromNow, pct } from '../../utils/format';
import { useNow } from '../../utils/hooks';
import { Async, Avatar, EmptyState, Loading, Pager, Panel, Tag } from '../../components/ui';
import { attempt, confirmDialog } from '../../components/feedback';
import { CompareBars, EntriesTimeline } from '../../components/Charts';

const FILTERS = [['ALL', 'Everyone'], ['PRESENT', 'Present'], ['ABSENT', 'Absent']];
const LIVE_LABEL = { live: ['Live', 'success', 'broadcast'], reconnecting: ['Reconnecting…', 'warning', 'arrow-repeat'], stopped: ['Live updates off', 'secondary', 'pause-circle'] };

function MarkPresentModal({ ev, attendee, onHide, onDone }) {
  const [gateId, setGateId] = useState(ev.gates[0]?.id || '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const r = await attempt(() => api(`/manage/events/${ev.id}/attendance`, {
      method: 'POST', body: { registrationId: attendee.registrationId, gateId: Number(gateId), reason: reason.trim() },
    }), `${attendee.person.name} marked present.`);
    setBusy(false);
    if (r) onDone();
  };
  return (
    <Modal show onHide={onHide} centered>
      <Form onSubmit={submit}>
        <Modal.Header closeButton><Modal.Title>Mark present</Modal.Title></Modal.Header>
        <Modal.Body>
          <div className="d-flex gap-2 align-items-center mb-3">
            <Avatar user={attendee.person} size={40} />
            <div><div className="fw-600">{attendee.person.name}</div><div className="small mono text-muted-2">{attendee.person.idLabel} · {attendee.person.sub}</div></div>
          </div>
          <p className="small text-muted-2">Use this when someone entered but couldn't be scanned (no phone, damaged screen). Their pass is used up, and the reason is kept in the audit log.</p>
          <Form.Group className="mb-2" controlId="mp-gate">
            <Form.Label>Gate</Form.Label>
            <Form.Select value={gateId} onChange={(e) => setGateId(e.target.value)}>{ev.gates.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Form.Select>
          </Form.Group>
          <Form.Group controlId="mp-reason">
            <Form.Label>Reason</Form.Label>
            <Form.Control as="textarea" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required
              placeholder="e.g. Phone battery dead — college ID card checked at Gate A" autoFocus />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" onClick={onHide}>Cancel</Button>
          <Button type="submit" disabled={busy || !reason.trim() || !gateId}><i className="bi bi-person-check me-1" />Mark present</Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

function FeedItem({ item, fresh }) {
  const meta = SCAN_RESULTS[item.result] || SCAN_RESULTS.INVALID_TOKEN;
  return (
    <li className={fresh ? 'fresh' : ''}>
      <span className={`feed-icon tone-${meta.tone}`}><i className={`bi bi-${meta.icon}`} aria-hidden="true" /></span>
      <div className="flex-grow-1 min-w-0">
        <div className="small text-truncate"><strong>{meta.title}</strong>{item.participant && <> · {item.participant.name} <span className="mono text-muted-2">{item.participant.idLabel}</span></>}</div>
        <div className="small-2 text-muted-2 text-truncate">
          {item.gateName || 'Gate'} · {item.scannedBy || 'scanner'}
          {item.method === 'OVERRIDE' && ' · by organizer'}{item.method === 'MANUAL' && ' · code typed'}
        </div>
      </div>
      <span className="small-2 text-muted-2 text-nowrap">{fmtTime(item.at)}</span>
    </li>
  );
}

function Downloads({ ev }) {
  const get = (kind, format) => attempt(() => download(`/manage/reports/events/${ev.id}/${kind}?format=${format}`, `${kind}.${format}`));
  const group = (kind, label) => (
    <>
      <Dropdown.Header>{label}</Dropdown.Header>
      {[['xlsx', 'Excel', 'file-earmark-spreadsheet'], ['pdf', 'PDF', 'file-earmark-pdf'], ['csv', 'CSV', 'filetype-csv']].map(([f, name, icon]) => (
        <Dropdown.Item key={f} onClick={() => get(kind, f)}><i className={`bi bi-${icon} me-2`} />{name}</Dropdown.Item>
      ))}
    </>
  );
  return (
    <Dropdown align="end">
      <Dropdown.Toggle size="sm" variant="outline-primary"><i className="bi bi-download me-1" />Download</Dropdown.Toggle>
      <Dropdown.Menu>
        {group('attendance', 'Attendance (present)')}
        <Dropdown.Divider />
        {group('absentees', 'Absentees / no-shows')}
        <Dropdown.Divider />
        {group('registrations', 'All registrations')}
      </Dropdown.Menu>
    </Dropdown>
  );
}

/** Attendance for one event (objective 4): counters, gates, timeline, breakdowns, live feed and the attendee list. */
export default function AttendanceTab({ ev, onChange }) {
  useNow(30000);
  const summary = useApi(`/manage/events/${ev.id}/attendance`, { poll: 60000 });
  const [filter, setFilter] = useState('ALL');
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [page, setPage] = useState(1);
  const list = useApi(`/manage/events/${ev.id}/attendance/list${qs({ filter, q: q.trim(), dept, page, size: 15 })}`);
  const [feed, setFeed] = useState(null);
  const [liveState, setLiveState] = useState(null);
  const [marking, setMarking] = useState(null);
  const [freshIds, setFreshIds] = useState(() => new Set());
  const refreshTimer = useRef(null);
  const phase = summary.data?.phase;

  // Seed the feed from the summary, then keep it current from the server push.
  useEffect(() => {
    if (summary.data && feed === null) {
      setFeed(summary.data.recent);
    }
  }, [summary.data, feed]);

  const refreshSoon = () => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      summary.reload();
      list.reload();
      onChange?.();
    }, 1200);
  };

  useEffect(() => {
    if (!phase || !['OPEN', 'UPCOMING'].includes(phase)) return undefined;
    const stop = subscribe(`/manage/events/${ev.id}/live`, (name, msg) => {
      if (name !== 'scan' || !msg.item) return;
      setFeed((f) => [msg.item, ...(f || []).filter((x) => x.id !== msg.item.id)].slice(0, 40));
      setFreshIds((x) => new Set(x).add(msg.item.id));
      setTimeout(() => setFreshIds((x) => { const n = new Set(x); n.delete(msg.item.id); return n; }), 1600);
      refreshSoon();
    }, setLiveState);
    return () => {
      stop();
      clearTimeout(refreshTimer.current);
    };
  }, [ev.id, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = () => {
    setMarking(null);
    summary.reload();
    list.reload();
    onChange?.();
  };
  const markAbsent = async (a) => {
    const reason = await confirmDialog({
      title: `Mark ${a.person.name} absent?`,
      message: 'This removes their entry, for example when the wrong student was marked present. While the event is running their pass works again.',
      confirmText: 'Mark absent', variant: 'danger',
      input: { label: 'Reason (kept in the audit log)', placeholder: 'e.g. Marked the wrong student by mistake', required: true },
    });
    if (!reason) return;
    if (await attempt(() => api(`/manage/events/${ev.id}/attendance/${a.registrationId}/remove`, { method: 'POST', body: { reason } }), `${a.person.name} marked absent.`)) changed();
  };

  return (
    <Async state={summary}>
      {(s) => {
        const absentLabel = s.phase === 'ENDED' ? 'no-shows' : 'not arrived yet';
        const timeline = s.timeline.map((b) => ({ name: fmtTime(b.at), entries: b.entries, total: b.cumulative }));
        const correctable = ['OPEN', 'ENDED'].includes(s.phase);
        return (
          <>
            {s.phase === 'UPCOMING' && <Alert variant="secondary" className="small"><i className="bi bi-clock me-2" />Gates open at {fmtDateTime(s.entryOpensAt)}. Entries will appear here as they are scanned, live.</Alert>}
            {s.phase === 'DRAFT' && <Alert variant="secondary" className="small">Publish the event first. Attendance starts when its gates open.</Alert>}
            {s.phase === 'CANCELLED' && <Alert variant="danger" className="small">This event was cancelled.</Alert>}
            {s.phase === 'ENDED' && <Alert variant="light" className="small border"><i className="bi bi-flag me-2" />This event has ended. The numbers below are final; corrections are still possible and are audited.</Alert>}

            <Row className="g-3 mb-3">
              <Col md={5} lg={4}>
                <Panel className="h-100">
                  <div className="text-center">
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="small text-muted-2 fw-600 text-uppercase">Present</span>
                      {liveState && <Tag tone={LIVE_LABEL[liveState][1]} icon={LIVE_LABEL[liveState][2]}>{LIVE_LABEL[liveState][0]}</Tag>}
                    </div>
                    <div className="big-counter my-1" aria-live="polite">{s.attended}</div>
                    <div className="small text-muted-2">of {s.confirmed} confirmed · {s.attendanceRate}%</div>
                    <ProgressBar now={s.attendanceRate} className="mt-2" style={{ height: 10 }} aria-label="Share present" variant="success" />
                    <div className="d-flex justify-content-around mt-3 small">
                      <span><strong>{s.lastHour}</strong><br /><span className="text-muted-2">last hour</span></span>
                      <span><strong>{s.absent}</strong><br /><span className="text-muted-2">{absentLabel}</span></span>
                      <span><strong className={s.rejectedScans ? 'text-danger' : ''}>{s.rejectedScans}</strong><br /><span className="text-muted-2">refused scans</span></span>
                    </div>
                    <div className="small-2 text-muted-2 mt-3">
                      {Object.entries(s.byMethod).filter(([, n]) => n > 0).map(([m, n]) => `${n} ${ENTRY_METHODS[m]?.label.toLowerCase() || m}`).join(' · ') || 'No entries yet'}
                    </div>
                  </div>
                </Panel>
              </Col>
              <Col md={7} lg={8}>
                <Panel title="By gate" icon="door-open" className="h-100" actions={<Downloads ev={ev} />}>
                  {!s.gates.length ? <p className="small text-muted-2 mb-0">No gates configured.</p> : s.gates.map((g) => (
                    <div key={g.gateId} className="mb-3">
                      <div className="d-flex justify-content-between small gap-2 flex-wrap">
                        <span className="fw-600">{g.gateName} <span className="text-muted-2 fw-normal">· {g.staff.join(', ') || 'no security assigned'}</span></span>
                        <span><strong>{g.entries}</strong> in{g.lastEntryAt && <span className="text-muted-2"> · last {fromNow(g.lastEntryAt)}</span>}</span>
                      </div>
                      <ProgressBar now={pct(g.entries, Math.max(s.attended, 1))} style={{ height: 8 }} aria-label={`${g.gateName} share of entries`} />
                    </div>
                  ))}
                </Panel>
              </Col>
            </Row>

            <Row className="g-3 mb-3">
              <Col lg={7}>
                <Panel title={`Entries over time (${s.bucketMinutes}-minute slots)`} icon="graph-up"><EntriesTimeline data={timeline} /></Panel>
              </Col>
              <Col lg={5}>
                <Panel title="By department" icon="diagram-3">
                  <CompareBars data={s.departments.map((d) => ({ name: d.key, confirmed: d.confirmed, attended: d.attended }))}
                    keys={[['confirmed', 'Confirmed'], ['attended', 'Present']]} />
                </Panel>
              </Col>
              {s.semesters.length > 1 && (
                <Col xs={12}>
                  <Panel title="By semester" icon="mortarboard">
                    <CompareBars data={s.semesters.map((d) => ({ name: `Sem ${d.key}`, confirmed: d.confirmed, attended: d.attended }))}
                      keys={[['confirmed', 'Confirmed'], ['attended', 'Present']]} height={220} />
                  </Panel>
                </Col>
              )}
            </Row>

            <Row className="g-3">
              <Col lg={5}>
                <Panel title="Live gate feed" icon="activity" flush actions={<span className="small-2 text-muted-2">Newest first</span>}>
                  {!feed?.length ? <EmptyState icon="upc-scan" title="No scans yet">Every scan at this event's gates appears here the moment it happens.</EmptyState> : (
                    <ul className="feed" aria-live="polite" aria-relevant="additions" style={{ maxHeight: 520, overflow: 'auto' }}>
                      {feed.map((i) => <FeedItem key={i.id} item={i} fresh={freshIds.has(i.id)} />)}
                    </ul>
                  )}
                </Panel>
              </Col>
              <Col lg={7}>
                <Panel title="Participants" icon="people" flush>
                  <div className="p-3 border-bottom d-flex flex-wrap gap-2 align-items-center">
                    <Nav variant="pills" activeKey={filter} onSelect={(k) => { setFilter(k); setPage(1); }} className="gap-1">
                      {FILTERS.map(([k, label]) => <Nav.Item key={k}><Nav.Link eventKey={k} className="py-1 px-2 small">{label}{k === 'PRESENT' ? ` (${s.attended})` : k === 'ABSENT' ? ` (${s.absent})` : ` (${s.confirmed})`}</Nav.Link></Nav.Item>)}
                    </Nav>
                    <div className="search-box ms-auto" style={{ minWidth: 180 }}>
                      <i className="bi bi-search" aria-hidden="true" />
                      <Form.Control size="sm" type="search" placeholder="Name or URN" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search participants" />
                    </div>
                    {s.departments.length > 1 && (
                      <Form.Select size="sm" value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }} aria-label="Department" style={{ width: 'auto' }}>
                        <option value="">All depts</option>
                        {s.departments.filter((d) => d.key !== 'OTHER').map((d) => <option key={d.key} value={d.key}>{d.key}</option>)}
                      </Form.Select>
                    )}
                  </div>
                  {!list.data ? <Loading /> : !list.data.items.length ? <EmptyState icon="people" title="Nobody here">No confirmed participant matches.</EmptyState> : (
                    <Table hover responsive className="mb-0 align-middle table-stack">
                      <thead><tr><th>Participant</th><th>Status</th><th>Entry</th><th className="text-end">Action</th></tr></thead>
                      <tbody>
                        {list.data.items.map((a) => (
                          <tr key={a.registrationId}>
                            <td className="td-main">
                              <div className="d-flex gap-2 align-items-center">
                                <Avatar user={a.person} size={32} />
                                <div className="min-w-0"><div className="fw-600 text-truncate">{a.person.name}</div><div className="small-2 text-muted-2 mono">{a.person.idLabel} · {a.person.sub}</div></div>
                              </div>
                            </td>
                            <td data-label="Status">{a.present ? <Tag tone="success" icon="check-circle">Present</Tag> : <Tag tone={s.phase === 'ENDED' ? 'danger' : 'secondary'} icon="dash-circle">{s.phase === 'ENDED' ? 'No-show' : 'Not yet'}</Tag>}</td>
                            <td data-label="Entry" className="small">
                              {a.present ? (
                                <>
                                  <div>{fmtTime(a.enteredAt)} · {a.gateName}</div>
                                  <div className="small-2 text-muted-2">{ENTRY_METHODS[a.method]?.label}{a.recordedBy && ` · ${a.recordedBy}`}</div>
                                  {a.overrideReason && <div className="small-2 text-muted-2 fst-italic">“{a.overrideReason}”</div>}
                                </>
                              ) : '—'}
                            </td>
                            <td data-label="Action" className="text-end">
                              {correctable && (a.present
                                ? <Button size="sm" variant="light" onClick={() => markAbsent(a)}><i className="bi bi-person-dash me-1" />Mark absent</Button>
                                : <Button size="sm" variant="outline-primary" onClick={() => setMarking(a)}><i className="bi bi-person-check me-1" />Mark present</Button>)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                  {list.data && list.data.pages > 1 && <div className="p-2"><Pager page={list.data.page} pages={list.data.pages} onChange={setPage} /></div>}
                </Panel>
              </Col>
            </Row>
            {marking && <MarkPresentModal ev={ev} attendee={marking} onHide={() => setMarking(null)} onDone={changed} />}
          </>
        );
      }}
    </Async>
  );
}

