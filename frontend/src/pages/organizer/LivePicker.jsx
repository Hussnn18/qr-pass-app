import { Button, Col, ProgressBar, Row } from 'react-bootstrap';
import { Link, Navigate } from 'react-router-dom';
import { useStore } from '../../store/store';
import { useCurrentUser } from '../../store/session';
import { byId, eventStats, managedEvents } from '../../store/selectors';
import { eventPhase } from '../../utils/eligibility';
import { fmtRange, pct } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { EmptyState, PageHeader, Panel, Tag } from '../../components/ui';

/** Lists events that are live or start within 24 hours; jumps straight in when there is only one live event. */
export default function LivePicker() {
  useTitle('Live attendance');
  const s = useStore();
  const user = useCurrentUser();
  const now = Date.now();
  const list = managedEvents(s, user)
    .filter((e) => ['PUBLISHED', 'CLOSED'].includes(e.status) && e.endsAt > now && e.startsAt < now + 864e5)
    .sort((a, b) => a.startsAt - b.startsAt);
  const live = list.filter((e) => eventPhase(e) === 'LIVE');
  if (live.length === 1 && list.length === 1) return <Navigate to={`/manage/events/${live[0].id}?tab=live`} replace />;

  return (
    <>
      <PageHeader title="Live attendance" subtitle="Events happening now or in the next 24 hours." />
      {!list.length ? (
        <Panel><EmptyState icon="broadcast" title="Nothing live right now" action={<Button as={Link} to="/manage/events">See all events</Button>}>Events appear here on the day they run.</EmptyState></Panel>
      ) : (
        <Row className="g-3">
          {list.map((e) => {
            const st = eventStats(s, e.id);
            return (
              <Col md={6} key={e.id}>
                <Panel title={e.title} actions={eventPhase(e) === 'LIVE' ? <Tag tone="danger" icon="broadcast">Live</Tag> : <Tag tone="primary">Today</Tag>}>
                  <div className="small text-muted-2 mb-2">{fmtRange(e.startsAt, e.endsAt)} · {byId(s.locations, e.venueId)?.name}</div>
                  <ProgressBar now={pct(st.attended, st.approved)} label={`${st.attended}/${st.approved}`} style={{ height: 16 }} />
                  <Button className="mt-3" as={Link} to={`/manage/events/${e.id}?tab=live`}><i className="bi bi-broadcast me-1" />Open live view</Button>
                </Panel>
              </Col>
            );
          })}
        </Row>
      )}
    </>
  );
}
