import { Card } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { CATEGORIES } from '../data/constants';
import { useStore } from '../store/store';
import { byId, eventStats, myRegistration } from '../store/selectors';
import { checkEligibility, eventPhase, registrationWindow } from '../utils/eligibility';
import { fmtRange } from '../utils/format';
import { CategoryChip, ModeBadge, SeatsBar, StatusBadge, Tag } from './ui';

export default function EventCard({ event, user }) {
  const s = useStore();
  const st = eventStats(s, event.id);
  const venue = byId(s.locations, event.venueId);
  const cat = CATEGORIES[event.category] || CATEGORIES.TECHNICAL;
  const participant = user && ['STUDENT', 'GUEST'].includes(user.role);
  const elig = participant ? checkEligibility(user, event) : null;
  const reg = user ? myRegistration(s, event.id, user.id) : null;
  const phase = eventPhase(event);
  const win = registrationWindow(event);
  const d = new Date(event.startsAt);

  return (
    <Card className="event-card h-100">
      <div className="event-band" style={{ '--cat': cat.color }}>
        <div className="date-block" aria-hidden="true">
          <span className="dm">{d.toLocaleDateString('en-IN', { month: 'short' })}</span>
          <span className="dd">{d.getDate()}</span>
        </div>
        <div className="d-flex flex-wrap gap-1 align-items-center">
          <CategoryChip category={event.category} />
          {phase === 'LIVE' && <span className="live-chip">● Live now</span>}
        </div>
      </div>
      <Card.Body className="d-flex flex-column">
        <h3 className="event-title">
          <Link to={`/events/${event.id}`} className="stretched-link">{event.title}</Link>
        </h3>
        <div className="event-meta"><i className="bi bi-clock" aria-hidden="true" /><span>{fmtRange(event.startsAt, event.endsAt)}</span></div>
        <div className="event-meta"><i className="bi bi-geo-alt" aria-hidden="true" /><span>{venue?.name}</span></div>
        <div className="mt-2 d-flex flex-wrap gap-1">
          {event.status === 'CANCELLED' || event.status === 'DRAFT' || event.status === 'COMPLETED' ? (
            <StatusBadge kind="event" status={event.status} />
          ) : (
            <ModeBadge mode={event.mode} />
          )}
          {event.allowOutsiders && <Tag tone="info" icon="globe2">Guests welcome</Tag>}
          {reg && reg.status !== 'CANCELLED' ? (
            <StatusBadge kind="reg" status={reg.status} />
          ) : elig && event.status === 'PUBLISHED' ? (
            elig.eligible ? <Tag tone="success" icon="check2">You're eligible</Tag> : <Tag tone="secondary" icon="slash-circle">Not eligible</Tag>
          ) : null}
          {participant && win.open && elig?.eligible && !reg && event.mode !== 'AUTO_ASSIGN' && (event.regClosesAt - Date.now() < 3 * 864e5) && (
            <Tag tone="warning" icon="alarm">Closing soon</Tag>
          )}
        </div>
        <div className="mt-auto pt-3">
          {event.status === 'CANCELLED' ? (
            <p className="small-2 text-danger mb-0"><i className="bi bi-info-circle me-1" />{event.cancelReason || 'This event was cancelled.'}</p>
          ) : (
            <SeatsBar approved={st.approved} capacity={event.capacity} waitlisted={st.waitlisted} />
          )}
        </div>
      </Card.Body>
    </Card>
  );
}
