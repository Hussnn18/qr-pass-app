import { useState } from 'react';
import { Button, Nav } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useStore } from '../../store/store';
import { useCurrentUser } from '../../store/session';
import { markAllRead, markRead } from '../../store/actions';
import { fmtDateTime, fromNow } from '../../utils/format';
import { useTitle } from '../../utils/hooks';
import { EmptyState, PageHeader, Panel } from '../../components/ui';

const ICONS = {
  APPROVED: ['check-circle', 'success'], PROMOTED: ['arrow-up-circle', 'success'], PASS: ['qr-code', 'primary'], ATTENDED: ['door-open', 'primary'],
  PENDING: ['hourglass-split', 'warning'], WAITLISTED: ['list-ol', 'info'], REJECTED: ['x-circle', 'danger'], CANCELLED: ['x-octagon', 'danger'],
  REVOKED: ['slash-circle', 'danger'], REMINDER: ['alarm', 'brand'], UPDATED: ['pencil-square', 'warning'], REQUESTS: ['person-check', 'warning'],
  LIVE: ['broadcast', 'danger'], DUTY: ['shield-check', 'primary'], DRAFT: ['pencil', 'secondary'], IMPORT: ['file-earmark-arrow-up', 'primary'],
  SECURITY: ['shield-exclamation', 'danger'], WELCOME: ['emoji-smile', 'success'], NEW_EVENT: ['calendar-plus', 'brand'],
};

export default function Notifications() {
  useTitle('Notifications');
  const user = useCurrentUser();
  const all = useStore((s) => s.notifications.filter((n) => n.userId === user.id));
  const [filter, setFilter] = useState('all');
  const list = filter === 'unread' ? all.filter((n) => !n.read) : all;
  const unread = all.filter((n) => !n.read).length;

  return (
    <>
      <PageHeader title="Notifications" subtitle="Registration decisions, pass updates, reminders and duty alerts." actions={unread > 0 && <Button variant="outline-primary" onClick={markAllRead}><i className="bi bi-check2-all me-1" />Mark all as read</Button>} />
      <Nav variant="pills" activeKey={filter} onSelect={setFilter} className="mb-3 gap-1">
        <Nav.Item><Nav.Link eventKey="all">All ({all.length})</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="unread">Unread ({unread})</Nav.Link></Nav.Item>
      </Nav>
      <Panel flush>
        {!list.length ? (
          <EmptyState icon="bell-slash" title="No notifications">{filter === 'unread' ? "You've read everything." : 'Updates about your events will appear here.'}</EmptyState>
        ) : (
          <ul className="feed">
            {list.map((n) => {
              const [icon, tone] = ICONS[n.type] || ['bell', 'secondary'];
              return (
                <li key={n.id} style={n.read ? undefined : { background: '#f6f7fd' }}>
                  <span className={`feed-icon tone-${tone}`}><i className={`bi bi-${icon}`} aria-hidden="true" /></span>
                  <div className="flex-grow-1 min-w-0">
                    <div className="fw-600">{!n.read && <span className="visually-hidden">Unread: </span>}{n.title}</div>
                    <div className="small text-muted-2">{n.message}</div>
                    <div className="small-2 text-muted-2 mt-1" title={fmtDateTime(n.at)}>{fromNow(n.at)}</div>
                  </div>
                  <div className="d-flex gap-2 flex-shrink-0">
                    {n.link && <Button size="sm" variant="light" as={Link} to={n.link} onClick={() => markRead(n.id)}>Open</Button>}
                    {!n.read && <Button size="sm" variant="link" onClick={() => markRead(n.id)} aria-label={`Mark "${n.title}" as read`}>Mark read</Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
